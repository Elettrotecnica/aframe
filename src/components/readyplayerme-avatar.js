/* global THREE */
var registerComponent = require('../core/component').registerComponent;

/**
 * A component providing a bit of facility to VR halfbody avatars from
 * https://readyplayer.me/
 *
 * Features:
 * - generate separate entities from each node in the model tree, so
 *   that e.g. hands can be moved or rotated separately from the rest
 *   of the body. This works by specifying sub-templates to the entity
 *   named after the nodes we want to expand.
 * - allow to hide certain parts of the model, so that e.g. one can
 *   use only the head and no hands. This works only on those
 *   ReadyPlayerMe models that use separate meshes for different parts
 *   of the body. Later model seem to use one single mesh, but it is
 *   possible to generate one that has no hands, when these are not
 *   needed.
 * - idle eyes animation triggers after a configurable number of
 *   seconds of inactivity.
 * - model will look either at a specific entity, or to entities that
 *   are making noise (via the downstream mediastream-listener
 *   component)
 *
 * Model is automatically rotated 180° (default would face the user)
 * and offset 65cm, so that head is at 0 level with respect to its
 * containing entity.
 *
 * Inspired by the "inflation" approach used in Mozilla Hubs
 *
 * See https://docs.readyplayer.me/ready-player-me/avatars/avatar-creator/vr-avatar for a description of the avatar's structure.
 *
 */
module.exports.Component = registerComponent('readyplayerme-avatar', {
  schema: {
    model: {type: 'model'},
    hands: {type: 'boolean', default: true},
    shirt: {type: 'boolean', default: true},
    head: {type: 'boolean', default: true},
    idleTimeout: {type: 'int', default: 10},
    lookAt: {type: 'selector'},
    listen: {type: 'boolean', default: true}
  },

  init: function () {
    this.model = null;
    this.animations = null;
    this.isIdle = false;
  },

  _inflate: function (node) {
    if (node.type === 'SkinnedMesh') {
      switch (node.name) {
        case 'Wolf3D_Hands':
          node.visible = this.data.hands;
          break;
        case 'Wolf3D_Shirt':
          node.visible = this.data.shirt;
          break;
        default:
          node.visible = this.data.head;
      }
    } else if (node.name === 'RightEye') {
      this.rightEye = node;
    } else if (node.name === 'LeftEye') {
      this.leftEye = node;
    }

    // inflate subtrees first so that we can determine whether or not this node needs to be inflated
    const childrenEntities = [];
    // setObject3D mutates the node's parent, so we have to use a copy
    // of the children as they are now (children is a live
    // collection).
    for (const child of node.children.slice(0)) {
      const childEntity = this._inflate(child);
      if (childEntity) {
        childrenEntities.push(childEntity);
      }
    }

    const nodeTemplate = this.el.querySelector('template[data-name=\'' + node.name + '\'');
    if (node.name !== 'Scene' && !nodeTemplate && childrenEntities.length === 0) {
      // This node won't become an entity
      return;
    }

    // If the user supplied a custom template for this node we will
    // use it, otherwise we default to an a-entity.
    var el;
    if (nodeTemplate && nodeTemplate.content.firstElementChild) {
      el = nodeTemplate.content.firstElementChild.cloneNode(true);
    } else {
      el = document.createElement('a-entity');
    }

    if (node.name === 'Scene') {
      // Compensate that the model is turned the other way around and
      // offset from the ground around 65cm, by countering this on the
      // scene element.
      el.setAttribute('position', '0 -0.65 0');
      el.setAttribute('rotation', '0 180 0');
    }

    for (const childEntity of childrenEntities) {
      el.appendChild(childEntity);
    }

    // Remove invalid CSS class name characters.
    const className = (node.name || node.uuid).replace(/[^\w-]/g, '');
    el.classList.add(className);

    // AFRAME rotation component expects rotations in YXZ, convert it
    if (node.rotation.order !== 'YXZ') {
      node.rotation.setFromQuaternion(node.quaternion, 'YXZ');
    }

    // Copy over the object's transform to the THREE.Group and reset the actual transform of the Object3D
    // all updates to the object should be done through the THREE.Group wrapper
    el.object3D.position.copy(node.position);
    el.object3D.rotation.copy(node.rotation);
    el.object3D.matrixNeedsUpdate = true;

    node.matrixAutoUpdate = false;
    node.matrix.identity();
    node.matrix.decompose(node.position, node.rotation, node.scale);

    el.setObject3D(node.type.toLowerCase(), node);

    // Set the name of the `THREE.Group` to match the name of the node,
    // so that templates can be attached to the correct AFrame entity.
    el.object3D.name = node.name;

    // Set the uuid of the `THREE.Group` to match the uuid of the node,
    // so that `THREE.PropertyBinding` will find (and later animate)
    // the group. See `PropertyBinding.findNode`:
    // https://github.com/mrdoob/three.js/blob/dev/src/animation/PropertyBinding.js#L211
    el.object3D.uuid = node.uuid;
    node.uuid = THREE.MathUtils.generateUUID();

    return el;
  },

  _look: function () {
    if (this.isIdle || !this.leftEye || !this.rightEye) {
      return;
    }

    let lookAt;
    if (this.listen) {
      let listener = this.el.components['mediastream-listener'];
      if (listener) {
        lookAt = listener.listen();
      }
    }

    if (lookAt) {
      this.lookAt = lookAt;
    } else {
      lookAt = this.lookAt;
    }

    // For every eye, see if we have something to look at, or just
    // look forward.
    for (let eye of [this.leftEye, this.rightEye]) {
      let x = 0;
      let y = 0;
      let z = 0;
      if (lookAt) {
        eye.lookAt(lookAt.object3D.position);
        x = eye.rotation.x;
        y = eye.rotation.y;
        z = eye.rotation.z;

        // To avoid the eyes going backwards, we constrain the
        // rotation to 1/4 of PI.
        if (Math.abs(x / Math.PI) > 1 / 4) {
          x = Math.PI / 4 * (x < 0 ? -1 : 1);
        }
        if (Math.abs(z / Math.PI) > 1 / 4) {
          z = Math.PI / 4 * (z < 0 ? -1 : 1);
        }
      }
      eye.rotation.set(x, y, z);
      // We compensate an offset PI/2 rotation on the X axis in the
      // eye model.
      eye.rotateX(Math.PI / 2);
    }
  },

  _startIdle: function () {
    // Forget what we were looking at as we become idle.
    this.lookAt = this.defaultLookAt;
    this.isIdle = true;
    this.idleAnimation.play();
  },

  _stopIdle: function () {
    this.isIdle = false;
    this.idleMixer.stopAllAction();
  },

  tick: function (time, delta) {
    if (!this.idleMixer) {
      // Model is not initialized yet.
      return;
    }

    this._look();

    this.idle -= delta;
    if (this.idle <= 0 && !this.isIdle) {
      this._startIdle();
    } else if (this.idle > 0 && this.isIdle) {
      this._stopIdle();
    }

    if (this.isIdle) {
      this.idleMixer.update(delta / 1000);
    }
  },

  update: function () {
    var self = this;
    var el = this.el;

    if (this.data.lookAt) {
      this.lookAt = this.data.lookAt;
      this.defaultLookAt = this.lookAt;
    }

    if (this.data.listen !== undefined) {
      this.listen = this.data.listen;
    }

    if (this.data.idleTimeout) {
      this.idleTimeout = this.data.idleTimeout * 1000;
      this.idle = this.idleTimeout;
    }

    var src = this.data.model;
    if (!src) { return; }

    this.remove();

    this.el.addEventListener('model-loaded', function (e) {
      const mesh = e.detail.model;

      // When the model comes with animations, get the idle_eyes_2 one
      // (the 5th one) and set it up so that whenever the model is
      // still for more than idleTimeout seconds, the animation will
      // start.
      if (mesh.animations && mesh.animations[4]) {
        const idleMixer = new THREE.AnimationMixer(mesh);
        const idleAnimation = idleMixer.clipAction(mesh.animations[4]);
        idleAnimation.clampWhenFinished = true;
        idleAnimation.loop = THREE.LoopPingPong;
        idleAnimation.repetitions = Infinity;
        idleAnimation.timeScale = 0.5;
        idleAnimation.time = 0;
        idleAnimation.weight = 1;

        this.setAttribute('absolute-position-listener', '');
        this.addEventListener('absolutePositionChanged', function () {
          self.idle = self.idleTimeout;
        });
        this.setAttribute('absolute-rotation-listener', '');
        this.addEventListener('absoluteRotationChanged', function () {
          self.idle = self.idleTimeout;
        });

        self.idleAnimation = idleAnimation;
        self.idleMixer = idleMixer;
      }

      const inflated = self._inflate(mesh);
      if (inflated) {
        el.appendChild(inflated);
      }
    });

    this.el.setAttribute('gltf-model', src);
  },

  remove: function () {
    this.el.removeAttribute('gltf-model');
  }
});

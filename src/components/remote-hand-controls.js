/* global THREE */
var registerComponent = require('../core/component').registerComponent;

// Found at https://github.com/aframevr/assets.
var MODEL_URLS = {
  toonLeft: 'https://cdn.aframe.io/controllers/hands/leftHand.glb',
  toonRight: 'https://cdn.aframe.io/controllers/hands/rightHand.glb',
  lowPolyLeft: 'https://cdn.aframe.io/controllers/hands/leftHandLow.glb',
  lowPolyRight: 'https://cdn.aframe.io/controllers/hands/rightHandLow.glb',
  highPolyLeft: 'https://cdn.aframe.io/controllers/hands/leftHandHigh.glb',
  highPolyRight: 'https://cdn.aframe.io/controllers/hands/rightHandHigh.glb'
};

// Poses.
var ANIMATIONS = {
  open: 'Open',
  // point: grip active, trackpad surface active, trigger inactive.
  point: 'Point',
  // pointThumb: grip active, trigger inactive, trackpad surface inactive.
  pointThumb: 'Point + Thumb',
  // fist: grip active, trigger active, trackpad surface active.
  fist: 'Fist',
  // hold: trigger active, grip inactive.
  hold: 'Hold',
  // thumbUp: grip active, trigger active, trackpad surface inactive.
  thumbUp: 'Thumb Up'
};

/**
 * A component to animate a hand model by directly specifying the
 * gesture.
 *
 * The purpose of this module is to implement "networked hands", where
 * the gesture performed from a hand-controls entity on host A are
 * collected, broadcasted to host B and mirrored by this component on
 * the remote avatar hands.
 *
 * Translate button events to semantic hand-related event names:
 *   (gripclose, gripopen, thumbup, thumbdown, pointup, pointdown)
 * Load hand model with gestures that are applied based on the button pressed.
 *
 * @property {string} Hand mapping (`left`, `right`).
 */
module.exports.Component = registerComponent('remote-hand-controls', {
  schema: {
    gesture: {default: ANIMATIONS.open, oneOf: Object.values(ANIMATIONS)},
    color: {default: 'white', type: 'color'},
    hand: { default: 'left' },
    handModelStyle: {default: 'lowPoly', oneOf: ['lowPoly', 'highPoly', 'toon']}
  },

  init: function () {
    var el = this.el;
    // Current pose.
    this.gesture = this.data.gesture;
    this.loader = new THREE.GLTFLoader();
    this.loader.setCrossOrigin('anonymous');

    el.object3D.visible = true;
  },

  tick: function (time, delta) {
    var mesh = this.el.getObject3D('mesh');

    if (!mesh || !mesh.mixer) { return; }

    mesh.mixer.update(delta / 1000);
  },

  /**
   * Update handler. Does the init stuff and most importantly, tracks
   * changes in the gesture property.
   */
  update: function (oldData) {
    var el = this.el;
    var hand = this.data.hand;
    var previousHand = oldData.hand;
    var handModelStyle = this.data.handModelStyle;
    var handColor = this.data.color;
    var gesture = this.data.gesture;
    var self = this;

    // Set model.
    if (hand !== previousHand) {
      var handmodelUrl = MODEL_URLS[handModelStyle + hand.charAt(0).toUpperCase() + hand.slice(1)];
      this.loader.load(handmodelUrl, function (gltf) {
        var mesh = gltf.scene.children[0];
        var handModelOrientation = hand === 'left' ? Math.PI / 2 : -Math.PI / 2;
        mesh.mixer = new THREE.AnimationMixer(mesh);
        self.clips = gltf.animations;
        el.setObject3D('mesh', mesh);

        var handMaterial = mesh.children[1].material;
        handMaterial.color = new THREE.Color(handColor);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, handModelOrientation);
      });
    }

    this.animateGesture(gesture);
  },

  remove: function () {
    this.el.removeObject3D('mesh');
  },

  /**
   * Play corresponding clip to a gesture
   */
  getClip: function (gesture) {
    var clip;
    var i;
    for (i = 0; i < this.clips.length; i++) {
      clip = this.clips[i];
      if (clip.name !== gesture) { continue; }
      return clip;
    }
  },

  /**
   * Play gesture animation.
   *
   * @param {string} gesture - Which pose to animate to.
   */
  animateGesture: function (gesture) {
    if (gesture && gesture !== this.gesture) {
      this.playAnimation(gesture, this.gesture);
      this.gesture = gesture;
    }
  },

  /**
  * Play hand animation based on button state.
  *
  * @param {string} gesture - Name of the animation as specified by the model.
  * @param {string} lastGesture - Previous pose.
  */
  playAnimation: function (gesture, lastGesture) {
    var clip;
    var fromAction;
    var mesh = this.el.getObject3D('mesh');
    var toAction;

    if (!mesh) { return; }

    // Stop all current animations.
    mesh.mixer.stopAllAction();

    // Grab clip action.
    clip = this.getClip(gesture);
    toAction = mesh.mixer.clipAction(clip);
    toAction.clampWhenFinished = true;
    toAction.loop = THREE.LoopRepeat;
    toAction.repetitions = 0;
    toAction.timeScale = 1;
    toAction.time = 0;
    toAction.weight = 1;

    // Animate or crossfade from gesture to gesture.
    clip = this.getClip(lastGesture);
    fromAction = mesh.mixer.clipAction(clip);
    fromAction.weight = 0.15;
    fromAction.play();
    toAction.play();
    fromAction.crossFadeTo(toAction, 0.15, true);
  }
});

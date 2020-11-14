var registerComponent = require('../core/component').registerComponent;
var THREE = require('../lib/three');

/**
 * A component for positional/non-positional audio that can get its
 * audio source directly from a MediaStream (e.g. webRTC), rather than
 * only from buffered sources (although probably more limited than the
 * upstream sound component in other regards).
 *
 * The MediaStream can be specified via javascript using the
 * setMediaStream method, or via the component attribute's src conf
 * using a selector for a HTMLMediaElement from which the MediaStream
 * will be extracted (when the browser supports the captureStream
 * API).
 *
 * Much of this code is actually a port of
 * https://github.com/networked-aframe/networked-aframe/blob/master/src/components/networked-audio-source.js
 * without dependencies on networked-aframe.
 */
module.exports.Component = registerComponent('mediastream-sound', {
  schema: {
    positional: { default: true },
    distanceModel: {
      default: 'inverse',
      oneOf: ['linear', 'inverse', 'exponential']
    },
    maxDistance: { default: 10000 },
    refDistance: { default: 1 },
    rolloffFactor: { default: 1 },
    src: {type: 'selector'},
    autoplay: {type: 'boolean', default: true}
  },

  init: function () {
    this.listener = null;
    this.stream = null;
    this.src = null;
  },

  /**
   * The stream can be set/changed by replacing the src conf with a
   * new one
   */
  update: function (oldData) {
    this._captureStream();
    this._setPannerProperties();
  },

  /**
   * One can also set the stream directly on the object via javascript
   */
  setMediaStream: function (newStream) {
    if (!this.sound) {
      this._setupSound();
    }
    if (newStream !== this.stream) {
      if (this.stream) {
        this.sound.disconnect();
      }
      if (newStream) {
        const soundSource = this.sound.context.createMediaStreamSource(newStream);
        this.sound.setNodeSource(soundSource);
        this.el.emit('sound-source-set', { soundSource });
      }
      this.stream = newStream;
    }
  },

  remove: function () {
    if (!this.sound) return;

    this.el.removeObject3D(this.attrName);
    if (this.stream) {
      this.sound.disconnect();
    }
  },

  _setPannerProperties () {
    if (this.sound && this.data.positional) {
      this.sound.setDistanceModel(this.data.distanceModel);
      this.sound.setMaxDistance(this.data.maxDistance);
      this.sound.setRefDistance(this.data.refDistance);
      this.sound.setRolloffFactor(this.data.rolloffFactor);
    }
  },

  _captureStream () {
    // We need the browser to support captureStream. In case your
    // browser doesn't (Safari, apparently), one can fallback to
    // setting the stream directly.
    if (this.data.src &&
        this.data.src instanceof HTMLMediaElement &&
        this.data.src.captureStream) {
      this.src = this.data.src;
      this.src.muted = true;

      if (this.data.autoplay) {
        this.src.autoplay = true;
        this.src.setAttribute('playsinline', 'playsinline');
      }

      var self = this;
      if (this.src.paused) {
        this.src.addEventListener('play', function () {
          self.setMediaStream(self.src.captureStream());
        });
      } else {
        self.setMediaStream(self.src.captureStream());
      }
    }
  },

  _setupSound () {
    var el = this.el;
    var sceneEl = el.sceneEl;

    if (this.sound) {
      el.removeObject3D(this.attrName);
    }

    if (!sceneEl.audioListener) {
      sceneEl.audioListener = new THREE.AudioListener();
      sceneEl.camera && sceneEl.camera.add(sceneEl.audioListener);
      sceneEl.addEventListener('camera-set-active', function (evt) {
        evt.detail.cameraEl.getObject3D('camera').add(sceneEl.audioListener);
      });
    }
    this.listener = sceneEl.audioListener;

    this.sound = this.data.positional
      ? new THREE.PositionalAudio(this.listener)
      : new THREE.Audio(this.listener);
    el.setObject3D(this.attrName, this.sound);
    this._setPannerProperties();
  }
});

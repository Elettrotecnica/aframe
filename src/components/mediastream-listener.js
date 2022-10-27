var registerComponent = require('../core/component').registerComponent;

/**
 * A component that "listens" to a stream and maintains a list of
 * "loud items" corrently on the scene. It also provides a method to
 * obtain the currently loudest item from the perspective of a
 * particular entity.
 *
 * Its purpose is to implement reaction to noise in a scene.
 *
 */
module.exports.Component = registerComponent('mediastream-listener', {
  init: function () {
    this.stream = null;
    this.dataArray = null;
    this.analyser = null;
    this.isMakingNoise = false;
    this.loudItems = {};
    let self = this;
    this.el.sceneEl.addEventListener('mediastream-listener-loud', function (e) {
      self.loudItems[e.detail.el] = e.detail;
    });
    this.el.sceneEl.addEventListener('mediastream-listener-silent', function (e) {
      if (self.loudItems[e.detail.el]) {
        self.loudItems[e.detail.el].delete;
      }
    });
  },

  tick: function () {
    if (!this.stream) return;
    let loudness = this._getLoudness();
    if (loudness > 127) {
      if (!this.isMakingNoise) {
        this.el.sceneEl.emit('mediastream-listener-loud', {
          el: this.el,
          loudness: loudness
        });
        console.log('sound');
        this.isMakingNoise = true;
      }
    } else if (this.isMakingNoise) {
      this.el.sceneEl.emit('mediastream-listener-silent', {
        el: this.el
      });
      console.log('no sound');
      this.isMakingNoise = false;
    }
  },

  // Returns the "loudest" sound from the perspective of this element.
  listen: function () {
    let maxNoise = 0;
    let maxItem = null;

    for (let key in this.loudItems) {
      let e = this.loudItems[key].el;
      if (e === this.el) continue;
      let loudness = this.loudItems[key].loudness;
      let myPosition = this.el.object3D.position;
      let soundPosition = e.object3D.position;
      let distance = myPosition.distanceTo(soundPosition);
      // We use an inverse quadratic attenuation based on the
      // distance.
      let noise = loudness / distance ** 2;
      if (noise > 0 && noise > maxNoise) {
        maxNoise = noise;
        maxItem = e;
      }
    }

    return maxItem;
  },

  // Returns our loudness as a number between 0 and 255
  _getLoudness: function () {
    let maxByteFrequencyData = 0;
    this.analyser.getByteFrequencyData(this.dataArray);
    for (let d of this.dataArray) {
      if (d > maxByteFrequencyData) {
        maxByteFrequencyData = d;
      }
    }
    return maxByteFrequencyData;
  },

  setMediaStream: function (stream) {
    const audioContext = new window.AudioContext();
    const soundSource = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    // We only want to detect sound, use a very low frequency
    // resolution for the analyzer.
    analyser.minDecibels = -100;
    analyser.maxDecibels = 0;
    analyser.fftSize = 32;
    soundSource.connect(analyser);
    this.analyser = analyser;
    this.dataArray = new Uint8Array(analyser.frequencyBinCount);
    this.stream = stream;
  }

});

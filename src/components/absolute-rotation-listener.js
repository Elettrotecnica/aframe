/* global THREE */
var registerComponent = require('../core/component').registerComponent;

/**
 * A simple component to listen to absolute rotation changes and
 * trigger an event other components can listen and react to.
 *
 * The reason why we listen to the absolute rotation instead than the
 * default rotation property is that this enables the use case of
 * entities such as the camera enclosed inside a camera rig. If we
 * rotate the rig, the rotation property of the enclosed entity
 * would not change.
*/
module.exports.Component = registerComponent('absolute-rotation-listener', {
  tick: function () {
    const newValue = this._getAbsoluteRotation();
    const stringCoords = window.AFRAME.utils.coordinates.stringify(newValue);
    if (this.lastRotation !== stringCoords) {
      this.el.emit('absoluteRotationChanged', newValue);
      this.lastRotation = stringCoords;
    }
  },
  _getAbsoluteRotation: (function () {
    const newValue = {'x': 0, 'y': 0, 'z': 0};
    return function () {
      // Note that we cannot use a getWorldQuaternion stunt here,
      // because various compensations are applied only to the relative
      // rotation depending on the device.
      newValue.x = 0;
      newValue.y = 0;
      newValue.z = 0;
      var el = this.el;
      while (el && el.object3D && el !== this.el.sceneEl) {
        newValue.x += el.object3D.rotation.x;
        newValue.y += el.object3D.rotation.y;
        newValue.z += el.object3D.rotation.z;
        el = el.parentElement;
      }
      newValue.x = THREE.MathUtils.radToDeg(newValue.x);
      newValue.y = THREE.MathUtils.radToDeg(newValue.y);
      newValue.z = THREE.MathUtils.radToDeg(newValue.z);
      return newValue;
    };
  })()
});

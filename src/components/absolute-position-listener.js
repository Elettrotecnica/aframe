var registerComponent = require('../core/component').registerComponent;

/**
 * A simple component to listen to absolute position changes and
 * trigger an event other components can listen and react to.
 *
 * The reason why we listen to the absolute position instead than the
 * default position property is that this enables the use case of
 * entities such as the camera enclosed inside a camera rig. If we
 * rotate the rig, the position property of the enclosed entity
 * would not change.
*/
module.exports.Component = registerComponent('absolute-position-listener', {
  tick: function () {
    const newValue = this._getAbsolutePosition();
    const stringCoords = window.AFRAME.utils.coordinates.stringify(newValue);
    if (this.lastPosition !== stringCoords) {
      this.el.emit('absolutePositionChanged', newValue);
      this.lastPosition = stringCoords;
    }
  },
  _getAbsolutePosition: (function () {
    const newValue = {'x': 0, 'y': 0, 'z': 0};
    return function () {
      // Note that we cannot use a getWorldPosition stunt here,
      // because various compensations are applied only to the
      // relative position depending on the device.
      newValue.x = 0;
      newValue.y = 0;
      newValue.z = 0;
      var el = this.el;
      while (el && el.object3D && el !== this.el.sceneEl) {
        newValue.x += el.object3D.position.x;
        newValue.y += el.object3D.position.y;
        newValue.z += el.object3D.position.z;
        el = el.parentElement;
      }
      return newValue;
    };
  })()
});

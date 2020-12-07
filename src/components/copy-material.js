var registerComponent = require('../core/component').registerComponent;

/**
 * A stupid component allowing to switch the material currently active
 * on a mesh, with that found on another mesh belonging to a different
 * entity.
 *
 * Implemented as a low-cost solution to reuse default a-frame
 * hand-controls hands giving them the skin of another model.
 *
*/
module.exports.Component = registerComponent('copy-material', {
  schema: {
    from: {type: 'selector'},
    fromObjectName: {type: 'string'},
    toObjectName: {type: 'string'}
  },

  init: function () {
    this.fromObject = null;
    this.toObject = null;
    this.attempts = 20;
  },

  update: function () {
    var self = this;

    if (!this.data.toObjectName) {
      this.toObject = this.el.getObject3D('mesh');
    } else {
      this.toObject = this.el.object3D.getObjectByName(this.data.toObjectName);
    }

    if (!this.data.fromObjectName) {
      this.fromObject = this.data.from.getObject3D('mesh');
    } else {
      this.fromObject = this.data.from.object3D.getObjectByName(this.data.fromObjectName);
    }

    if (!this.toObject ||
        !this.toObject.material ||
        !this.fromObject ||
        !this.fromObject.material) {
      if ((this.attempts--) > 0) {
        setTimeout(function () {
          self.update();
        }, 50);
      }
    } else {
      this.toObject.material = this.fromObject.material;
    }
  }
});

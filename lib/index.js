'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Timeline = exports.Effects = exports.Easings = exports.Animator = undefined;

var _spriteTimeline = require('sprite-timeline');

var _spriteTimeline2 = _interopRequireDefault(_spriteTimeline);

var _effect = require('./effect');

var _effect2 = _interopRequireDefault(_effect);

var _easing = require('./easing');

var _animator = require('./animator');

var _animator2 = _interopRequireDefault(_animator);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.Animator = _animator2.default;
exports.Easings = _easing.Easings;
exports.Effects = _effect2.default;
exports.Timeline = _spriteTimeline2.default;
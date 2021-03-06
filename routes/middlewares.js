/**
 * @license GPLv3
 * @author 0@39.yt (Yurij Mikhalevich)
 */

var logger = require('winston'),
    validate = require('revalidator').validate,
    validator = require('../public/js/validator'),
    roleEvents = {
      client: ['tasks:retrieve', 'tasks:save', 'tasks:close',
        'task comments:retrieve', 'task comments:save', 'task types:retrieve',
        'profiles:retrieve', 'profiles:save', 'task comments:unsubscribe'],
      helper: ['tasks:retrieve', 'task comments:retrieve', 'task comments:save',
        'task types:retrieve', 'university departments:retrieve',
        'profiles:retrieve', 'profiles:save', 'task comments:unsubscribe'],
      'subdepartment chief': ['tasks:retrieve', 'task comments:retrieve',
        'task comments:save', 'task types:retrieve',
        'university departments:retrieve', 'profiles:retrieve', 'profiles:save',
        'task comments:unsubscribe']
    };


/**
 * @param {Object} req Express.io request object
 * @param {Function} next
 */
exports.checkPermissions = function(req, next) {
  var user = req.handshake.user;
  if (user.role === 'department chief' ||
      roleEvents[user.role].indexOf(req.io.event) !== -1) {
    next();
  } else {
    logger.warn('Insufficient permissions. %s with id %s trying to emit %s',
        user.role, user.id, req.io.event);
    req.io.emit('err', 'Forbidden');
  }
};


/**
 * @param {Object} req Express.io request object
 * @param {Function} next
 */
exports.validateRequestData = function(req, next) {
  var validationResult = validator(validate, req.io.event + '-' +
      req.handshake.user.role, req.data);
  if (!validationResult.valid && validationResult.errors[0].message ===
      'invalid entity type') {
    validationResult = validator(validate, req.io.event, req.data);
  }
  if (validationResult.valid) {
    next();
  } else {
    logger.warn('Invalid data was sent with event %s', req.io.event, req.data,
        validationResult.errors);
    req.io.emit('err', validationResult);
  }
};

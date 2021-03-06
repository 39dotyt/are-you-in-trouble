/**
 * @license GPLv3
 * @author 0@39.yt (Yurij Mikhalevich)
 */

var cbs = require('./callbacks'),
    db = require('../lib/database'),
    mailer = require('../lib/mailer');


/**
 * @param {Object} req Express.io request object
 */
exports.retrieve = function(req) {
  var user = req.handshake.user,
      limit = req.data.limit || 50,
      offset = req.data.offset || 0,
      order = req.data.order,
      filters = req.data.filters;
  if (user.role === 'client') {
    req.io.join('tasks ud' + user.universityDepartmentId);
    db.tasks.retrieve.forClient(user.id, offset, limit, order, filters,
        cbs.respond(req));
  } else if (user.role === 'helper') {
    req.io.join('tasks h' + user.id);
    db.tasks.retrieve.forHelper(user.id, offset, limit, order, filters,
        cbs.respond(req));
  } else if (user.role === 'subdepartment chief') {
    req.io.join('tasks sd' + user.subdepartmentId);
    db.tasks.retrieve.forSubdepartmentChief(user.id, offset, limit, order,
        filters, cbs.respond(req));
  } else { // if (user.role === 'department chief'
    req.io.join('tasks dc');
    db.tasks.retrieve.forDepartmentChief(offset, limit, order, filters,
        cbs.respond(req));
  }
};


/**
 * @param {Object} req Express.io request object
 */
exports.save = function(req) {
  var user = req.handshake.user;
  if (user.role === 'client') {
    req.data.clientId = user.id;
    req.data.universityDepartmentId = user.universityDepartmentId;
  }
  db.tasks.save(req.data, cbs.doNext(req, function(task) {
    task.helperIds = [];
    task.commentCount = 0;
    notifyUsersAboutTaskUpdate(req,
        req.data.id ? 'tasks:update' : 'tasks:insert', task);
    req.io.respond(task);
  }));
};


/**
 * @param {Object} req Express.io request object
 */
exports.close = function(req) {
  db.tasks.close(req.data.taskId, req.handshake.user.id,
      cbs.doNext(req, function(task) {
        notifyUsersAboutTaskUpdate(req, 'tasks:update', task);
        req.io.respond(task);
      }));
};


/**
 * @param {Object} req Express.io request object
 */
exports.remove = function(req) {
  db.tasks.remove(req.data.taskId, cbs.doNext(req, function(task) {
    notifyUsersAboutTaskUpdate(req, 'tasks:remove', task);
    req.io.respond({ok: true});
  }));
};


/**
 * @param {Object} req Express.io request object
 */
exports['add helper'] = function(req) {
  db.tasks.addHelper(req.data.taskId, req.data.helperId,
      cbs.doNext(req, function() {
        notifyUsersAboutHelpersChange(req, 'tasks:add helper', req.data.taskId,
            req.data.helperId);
        req.io.respond({ok: true});
      }));
};


/**
 * @param {Object} req Express.io request object
 */
exports['remove helper'] = function(req) {
  db.tasks.removeHelper(req.data.taskId, req.data.helperId,
      cbs.doNext(req, function() {
        notifyUsersAboutHelpersChange(req, 'tasks:remove helper',
            req.data.taskId, req.data.helperId);
        req.io.respond({ok: true});
      }));
};


/**
 * @param {Object} req Express.io request object
 * @param {string} event
 * @param {Object} task
 * @param {Object=} opt_data
 */
function notifyUsersAboutTaskUpdate(req, event, task, opt_data) {
  req.io.room('tasks ud' + task.universityDepartmentId).broadcast(
      event, opt_data || task);
  if (task.subdepartmentId) {
    // FIXME: handle subdepartment change
    req.io.room('tasks sd' + task.subdepartmentId).broadcast(
        event, opt_data || task);
  }
  req.io.room('tasks dc').broadcast(event, opt_data || task);
  mailer.mailUsersAboutTaskUpdate(event, task);
}


/**
 * @param {Object} req Express.io request object
 * @param {string} event
 * @param {number} taskId
 * @param {number} helperId
 */
function notifyUsersAboutHelpersChange(req, event, taskId, helperId) {
  db.tasks.retrieve.forDepartmentChief(0, 1, undefined, {id: taskId},
      cbs.doNext(req, function(tasks) {
        var task = tasks[0];
        notifyUsersAboutTaskUpdate(req, event, task,
            {taskId: taskId, helperId: helperId});
        req.io.room('tasks h' + helperId).broadcast(event, task);
        mailer.mailUsersAboutTaskUpdate(event, task);
      }));
}

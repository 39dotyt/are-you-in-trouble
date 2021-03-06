/**
 * @license GPLv3
 * @author 0@39.yt (Yurij Mikhalevich)
 */

var settings = require('cat-settings'),
    async = require('async'),
    pool = require('./pool'),
    routines = require('./routines'),
    errors = require('../errors'),
    prefix = settings.database.prefix,
    defaultOrder = [
      {column: 'updated_at', direction: 'DESC'}
    ], defaultFilters = {
      closed_by_id: null
    }, queryBlank = {
      baseSelect: 'SELECT t.*, t.created_at::TEXT, t.updated_at::TEXT, ' +
          '"' + prefix + 'array_agg_notnull"(DISTINCT th.helper_id) AS' +
          ' helper_ids, COUNT(DISTINCT tc.id)::INT AS comment_count FROM "' +
          prefix + 'task" AS t',
      joins: 'LEFT JOIN "' + prefix + 'task2helper" AS th ON' +
          ' t.id = th.task_id LEFT JOIN "' + prefix + 'task_comment"' +
          ' AS tc ON t.id = tc.task_id'
    };


/**
 * Retrieves tasks list.
 *
 * Users of any role can filter tasks by <<closed>>, <<client>>, <<taskType>>
 * and <<timestamp>> fields.
 *
 * Method behavior are different for users of different roles:
 * 1. departmentChief - retrieves all tasks. Can additionally filter them by
 * subDepartment, universityDepartment and helpers.
 * 2. subDepartmentChief - retrieves tasks only for his subDepartment. Can
 * additionally filter them by universityDepartment and helpers.
 * 3. helper - retrieves tasks, which he should solve. Can additionally filter
 * them by universityDepartment.
 * 4. client - retrieves tasks, which related to his universityDepartment.
 */
exports.retrieve = {};


/**
 * @param {number} clientId
 * @param {number} offset
 * @param {number} limit
 * @param {Object[]} order
 * @param {Object} filters
 * @param {Function} cb
 */
exports.retrieve.forClient = function(clientId, offset, limit, order, filters,
                                      cb) {
  var placeholdersData = [clientId],
      query = queryBlank.baseSelect + ' INNER JOIN "' + prefix + 'user" AS u ' +
          ' ON u.id = $1 AND u.university_department_id =' +
          ' t.university_department_id ' + queryBlank.joins;
  routines.execSelectQuery(query, placeholdersData, 't', offset, limit,
      order || defaultOrder, filters || defaultFilters, cb);
};


/**
 * @param {number} helperId
 * @param {number} offset
 * @param {number} limit
 * @param {Object[]} order
 * @param {Object} filters
 * @param {Function} cb
 */
exports.retrieve.forHelper = function(helperId, offset, limit, order, filters,
                                      cb) {
  var placeholdersData = [helperId],
      query = queryBlank.baseSelect + ' INNER JOIN "' + prefix +
          'task2helper" AS t2h ON t2h.helper_id = $1 AND t2h.task_id = t.id ' +
          queryBlank.joins;
  routines.execSelectQuery(query, placeholdersData, 't', offset, limit,
      order || defaultOrder, filters || defaultFilters, cb);
};


/**
 * @param {number} subdepartmentChiefId
 * @param {number} offset
 * @param {number} limit
 * @param {Object[]} order
 * @param {Object} filters
 * @param {Function} cb
 */
exports.retrieve.forSubdepartmentChief = function(subdepartmentChiefId, offset,
                                                  limit, order, filters, cb) {
  var placeholdersData = [subdepartmentChiefId],
      query = queryBlank.baseSelect + ' INNER JOIN "' + prefix + 'user" AS u ' +
          ' ON u.id = $1 AND u.subdepartment_id = t.subdepartment_id ' +
          queryBlank.joins;
  routines.execSelectQuery(query, placeholdersData, 't', offset, limit,
      order || defaultOrder, filters || defaultFilters, cb);
};


/**
 * @param {number} offset
 * @param {number} limit
 * @param {Object[]} order
 * @param {Object} filters
 * @param {Function} cb
 */
exports.retrieve.forDepartmentChief = function(offset, limit, order, filters,
                                               cb) {
  var query = queryBlank.baseSelect + ' ' + queryBlank.joins;
  routines.execSelectQuery(query, [], 't', offset, limit, order || defaultOrder,
      filters || defaultFilters, cb);
};


/**
 * @param {Object} task
 * @param {Function} cb
 */
exports.save = function(task, cb) {
  if (task.id) {
    pool.query('UPDATE "' + prefix + 'task" SET updated_at = $1,' +
        ' content = $2, type_id = $3, client_id = $4,' +
        ' university_department_id = $5, subdepartment_id = $6 WHERE id = $7' +
        ' RETURNING *, created_at::TEXT, updated_at::TEXT', [new Date(),
          task.content, task.typeId, task.clientId, task.universityDepartmentId,
          task.subdepartmentId, task.id],
        routines.returnOneEntity(cb, 'There is no task with id ' + task.id));
  } else {
    pool.query('INSERT INTO "' + prefix + 'task" (created_at, updated_at,' +
        ' content, type_id, client_id, university_department_id,' +
        ' subdepartment_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *,' +
        ' created_at::TEXT, updated_at::TEXT', [new Date(), new Date(),
          task.content, task.typeId, task.clientId, task.universityDepartmentId,
          task.subdepartmentId], routines.returnOneEntity(cb));
  }
};


/**
 * @param {number} taskId
 * @param {number} closedById
 * @param {Function} cb
 */
exports.close = function(taskId, closedById, cb) {
  pool.query('UPDATE "' + prefix + 'task" SET closed_by_id = $1,' +
      ' updated_at = $2 WHERE id = $3 RETURNING *, created_at::TEXT,' +
      ' updated_at::TEXT', [closedById, new Date(), taskId],
      routines.returnOneEntity(cb, 'There is no task with id ' + taskId));
};


/**
 * @param {number} taskId
 * @param {Function} cb
 */
exports.remove = function(taskId, cb) {
  pool.query('DELETE FROM "' + prefix + 'task" WHERE id = $1 RETURNING *,' +
      ' created_at::TEXT, updated_at::TEXT', [taskId],
      routines.returnOneEntity(cb, 'There is no task with id ' + taskId));
};


/**
 * @param {number} taskId
 * @param {number} helperId
 * @param {Function} cb
 */
exports.addHelper = function(taskId, helperId, cb) {
  async.waterfall([
    function(cb) {
      pool.query('SELECT subdepartment_id FROM "' + prefix + 'user" WHERE' +
          ' role IN (\'helper\', \'subdepartment chief\') AND id = $1',
          [helperId], cb);
    }, function(res, cb) {
      if (!res.rowCount) {
        cb(new errors.Internal('There is no helper with id ' + helperId), null);
      } else {
        var helperSubdepartmentId = res.rows[0].subdepartment_id;
        pool.query('SELECT subdepartment_id FROM "' + prefix + 'task" WHERE' +
            ' id = $1', [taskId],
            function(err, res) {
              if (err || !res.rowCount) {
                cb(err || new errors.Internal('There is no task with id ' +
                    taskId), null);
              } else if (res.rows[0].subdepartment_id ===
                  helperSubdepartmentId) {
                cb(err, helperSubdepartmentId);
              } else if (res.rows[0].subdepartment_id === null) {
                pool.query('UPDATE "' + prefix + 'task"' +
                    ' SET subdepartment_id = $1', [helperSubdepartmentId], cb);
              } else { // if !== null && !== helperSubdepartmentId
                cb(new errors.Internal(
                    'You may assign helpers only from tasks subdepartment'),
                    null);
              }
            });
      }
    }
  ], function(err) {
    if (err) {
      cb(err, null);
    } else {
      pool.query('INSERT INTO "' + prefix + 'task2helper" (task_id,' +
          ' helper_id) VALUES ($1, $2)', [taskId, helperId], cb);
    }
  });
};


/**
 * @param {number} taskId
 * @param {number} helperId
 * @param {Function} cb
 */
exports.removeHelper = function(taskId, helperId, cb) {
  pool.query('DELETE FROM "' + prefix + 'task2helper" WHERE task_id = $1 AND' +
      ' helper_id = $2', [taskId, helperId], cb);
};

"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = applyRemoteChanges;

var _rambdax = require("rambdax");

var _fp = require("../../utils/fp");

var _common = require("../../utils/common");

var Q = _interopRequireWildcard(require("../../QueryDescription"));

var _Schema = require("../../Schema");

var _helpers = require("./helpers");

function _getRequireWildcardCache() { if ("function" !== typeof WeakMap) return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (null != obj) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || "[object Arguments]" === Object.prototype.toString.call(iter)) return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var idsForChanges = function ({
  created: created,
  updated: updated,
  deleted: deleted
}) {
  var ids = [];
  created.forEach(function (record) {
    ids.push(record.id);
  });
  updated.forEach(function (record) {
    ids.push(record.id);
  });
  return ids.concat(deleted);
};

var fetchRecordsForChanges = function (collection, changes) {
  var ids = idsForChanges(changes);

  if (ids.length) {
    return collection.query(Q.where((0, _Schema.columnName)('id'), Q.oneOf(ids))).fetch();
  }

  return Promise.resolve([]);
};

var findRecord = function (id, list) {
  // perf-critical
  for (var i = 0, len = list.length; i < len; i += 1) {
    if (list[i]._raw.id === id) {
      return list[i];
    }
  }

  return null;
};

function recordsToApplyRemoteChangesTo(collection, changes) {
  return new Promise(function ($return, $error) {
    var database, table, deletedIds, records, locallyDeletedIds;
    ({
      database: database,
      table: table
    } = collection);
    ({
      deleted: deletedIds
    } = changes);
    return Promise.resolve(Promise.all([fetchRecordsForChanges(collection, changes), database.adapter.getDeletedRecords(table)])).then(function ($await_1) {
      try {
        [records, locallyDeletedIds] = $await_1;
        return $return(_objectSpread({}, changes, {
          records: records,
          locallyDeletedIds: locallyDeletedIds,
          recordsToDestroy: (0, _rambdax.filter)(function (record) {
            return deletedIds.includes(record.id);
          }, records),
          deletedRecordsToDestroy: (0, _rambdax.filter)(function (id) {
            return deletedIds.includes(id);
          }, locallyDeletedIds)
        }));
      } catch ($boundEx) {
        return $error($boundEx);
      }
    }, $error);
  });
}

function validateRemoteRaw(raw) {
  // TODO: I think other code is actually resilient enough to handle illegal _status and _changed
  // would be best to change that part to a warning - but tests are needed
  (0, _common.invariant)(raw && 'object' === typeof raw && 'id' in raw && !('_status' in raw || '_changed' in raw), "[Sync] Invalid raw record supplied to Sync. Records must be objects, must have an 'id' field, and must NOT have a '_status' or '_changed' fields");
}

function prepareApplyRemoteChangesToCollection(collection, recordsToApply, sendCreatedAsUpdated, log) {
  var {
    database: database,
    table: table
  } = collection;
  var {
    created: created,
    updated: updated,
    recordsToDestroy: deleted,
    records: records,
    locallyDeletedIds: locallyDeletedIds
  } = recordsToApply; // if `sendCreatedAsUpdated`, server should send all non-deleted records as `updated`
  // log error if it doesn't — but disable standard created vs updated errors

  if (sendCreatedAsUpdated && created.length) {
    (0, _common.logError)("[Sync] 'sendCreatedAsUpdated' option is enabled, and yet server sends some records as 'created'");
  }

  var recordsToBatch = []; // mutating - perf critical
  // Insert and update records

  created.forEach(function (raw) {
    validateRemoteRaw(raw);
    var currentRecord = findRecord(raw.id, records);

    if (currentRecord) {
      (0, _common.logError)("[Sync] Server wants client to create record ".concat(table, "#").concat(raw.id, ", but it already exists locally. This may suggest last sync partially executed, and then failed; or it could be a serious bug. Will update existing record instead."));
      recordsToBatch.push((0, _helpers.prepareUpdateFromRaw)(currentRecord, raw, log));
    } else if (locallyDeletedIds.includes(raw.id)) {
      (0, _common.logError)("[Sync] Server wants client to create record ".concat(table, "#").concat(raw.id, ", but it already exists locally and is marked as deleted. This may suggest last sync partially executed, and then failed; or it could be a serious bug. Will delete local record and recreate it instead.")); // Note: we're not awaiting the async operation (but it will always complete before the batch)

      database.adapter.destroyDeletedRecords(table, [raw.id]);
      recordsToBatch.push((0, _helpers.prepareCreateFromRaw)(collection, raw));
    } else {
      recordsToBatch.push((0, _helpers.prepareCreateFromRaw)(collection, raw));
    }
  });
  updated.forEach(function (raw) {
    validateRemoteRaw(raw);
    var currentRecord = findRecord(raw.id, records);

    if (currentRecord) {
      recordsToBatch.push((0, _helpers.prepareUpdateFromRaw)(currentRecord, raw, log));
    } else if (!locallyDeletedIds.includes(raw.id)) {
      // Record doesn't exist (but should) — just create it
      sendCreatedAsUpdated || (0, _common.logError)("[Sync] Server wants client to update record ".concat(table, "#").concat(raw.id, ", but it doesn't exist locally. This could be a serious bug. Will create record instead."));
      recordsToBatch.push((0, _helpers.prepareCreateFromRaw)(collection, raw));
    }
  });
  deleted.forEach(function (record) {
    recordsToBatch.push(record.prepareDestroyPermanently());
  });
  return recordsToBatch;
}

var getAllRecordsToApply = function (db, remoteChanges) {
  return (0, _rambdax.piped)(remoteChanges, (0, _rambdax.map)(function (changes, tableName) {
    var collection = db.collections.get(tableName);

    if (!collection) {
      return Promise.reject(new Error("You are trying to sync a collection named ".concat(tableName, ", but currently this collection does not exist.") + "Have you remembered to add it to your Database constructor's modelClasses property?"));
    }

    return recordsToApplyRemoteChangesTo(collection, changes);
  }), _rambdax.promiseAllObject);
};

var destroyAllDeletedRecords = function (db, recordsToApply) {
  return (0, _rambdax.piped)(recordsToApply, (0, _rambdax.map)(function ({
    deletedRecordsToDestroy: deletedRecordsToDestroy
  }, tableName) {
    return deletedRecordsToDestroy.length && db.adapter.destroyDeletedRecords(tableName, deletedRecordsToDestroy);
  }), _rambdax.promiseAllObject);
};

var prepareApplyAllRemoteChanges = function (db, recordsToApply, sendCreatedAsUpdated, log) {
  return (0, _rambdax.piped)(recordsToApply, (0, _rambdax.map)(function (records, tableName) {
    return prepareApplyRemoteChangesToCollection(db.collections.get(tableName), records, sendCreatedAsUpdated, log);
  }), _rambdax.values, _fp.unnest);
}; // See _unsafeBatchPerCollection - temporary fix


var unsafeBatchesWithRecordsToApply = function (db, recordsToApply, sendCreatedAsUpdated, log) {
  return (0, _rambdax.piped)(recordsToApply, (0, _rambdax.map)(function (records, tableName) {
    return (0, _rambdax.piped)(prepareApplyRemoteChangesToCollection(db.collections.get(tableName), records, sendCreatedAsUpdated, log), (0, _rambdax.splitEvery)(5000), (0, _rambdax.map)(function (recordBatch) {
      return db.batch.apply(db, _toConsumableArray(recordBatch));
    }));
  }), _rambdax.values, _fp.unnest);
};

function applyRemoteChanges(db, remoteChanges, sendCreatedAsUpdated, log, _unsafeBatchPerCollection) {
  (0, _helpers.ensureActionsEnabled)(db);
  return db.action(function () {
    return new Promise(function ($return, $error) {
      var recordsToApply;
      return Promise.resolve(getAllRecordsToApply(db, remoteChanges)).then(function ($await_2) {
        try {
          recordsToApply = $await_2;
          return Promise.resolve(Promise.all([destroyAllDeletedRecords(db, recordsToApply)].concat(_toConsumableArray(_unsafeBatchPerCollection ? unsafeBatchesWithRecordsToApply(db, recordsToApply, sendCreatedAsUpdated, log) : [db.batch.apply(db, _toConsumableArray(prepareApplyAllRemoteChanges(db, recordsToApply, sendCreatedAsUpdated, log)))])))).then(function () {
            try {
              return $return();
            } catch ($boundEx) {
              return $error($boundEx);
            }
          }, $error);
        } catch ($boundEx) {
          return $error($boundEx);
        }
      }, $error);
    });
  }, 'sync-applyRemoteChanges');
}
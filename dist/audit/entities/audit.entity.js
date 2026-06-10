"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditEntity = exports.AuditAction = void 0;
var AuditAction;
(function (AuditAction) {
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["EXECUTE_QUERY"] = "EXECUTE_QUERY";
    AuditAction["LOGIN"] = "LOGIN";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
class AuditEntity {
    id;
    userId;
    action;
    resource;
    resourceId;
    metadata;
    timestamp;
}
exports.AuditEntity = AuditEntity;
//# sourceMappingURL=audit.entity.js.map
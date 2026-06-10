"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserEntity = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["ADMIN"] = "ADMIN";
    UserRole["DEVELOPER"] = "DEVELOPER";
    UserRole["VIEWER"] = "VIEWER";
})(UserRole || (exports.UserRole = UserRole = {}));
class UserEntity {
    id;
    username;
    email;
    passwordHash;
    role;
    isActive;
    createdAt;
    updatedAt;
}
exports.UserEntity = UserEntity;
//# sourceMappingURL=user.entity.js.map
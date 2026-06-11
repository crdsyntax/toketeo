import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info, context: ExecutionContext) {
    // In development/local mode, if no token is provided,
    // we can optionally allow a "guest" or "root" identity
    // to prevent total lockout while the auto-login flow kicks in.
    if (
      !user &&
      (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)
    ) {
      return { id: 'root', username: 'root', role: 'admin' };
    }
    return super.handleRequest(err, user, info, context);
  }
}

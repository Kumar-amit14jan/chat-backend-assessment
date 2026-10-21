export class UserNotFoundError extends Error {
  constructor(public readonly userIds: string[]) {
    super('One or more users do not exist');
    this.name = 'UserNotFoundError';
  }
}

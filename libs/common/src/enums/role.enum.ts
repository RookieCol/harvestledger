/**
 * Application roles. The `rol` column on UserEntity stores these string values.
 * (The column stays a plain string for now; a proper enum column is a migration
 * concern for the data-hygiene slice.)
 */
export enum Role {
  Admin = 'admin',
  Farmer = 'farmer',
}

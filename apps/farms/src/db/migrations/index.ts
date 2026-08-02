import { FarmsInitialSchema1785100000000 } from './1785100000000-FarmsInitialSchema';
import { FarmsOutbox1785100000001 } from './1785100000001-FarmsOutbox';
import { FarmsUserProjection1785100000002 } from './1785100000002-FarmsUserProjection';

export const migrations = [
  FarmsInitialSchema1785100000000,
  FarmsOutbox1785100000001,
  FarmsUserProjection1785100000002,
];

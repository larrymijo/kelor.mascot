/**
 * Typed access to the mascot contract for runtime code.
 *
 * Only the type is imported from the schema, so Zod stays out of the client
 * bundle. `schema.test.ts` validates the JSON in CI, which is what makes this
 * cast safe.
 */
import raw from '../../../character.json'
import type { Character } from './schema'

export type { Character, CharacterTier, QualityTierName } from './schema'

// JSON imports widen tuples to number[], hence the double cast.
export const character = raw as unknown as Character

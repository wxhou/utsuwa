// Recursive helper: dot-joined leaf key paths of a nested dictionary object.
// `en` is `as const`, so leaves are string-literal leaf values; keyof-style
// derivation gives compile-time-checked translation keys.
type Primitive = string | number | boolean;

export type LeafPaths<T> = T extends Primitive
	? never
	: {
			[K in keyof T & string]: T[K] extends Primitive
				? K
				: T[K] extends object
					? `${K}.${LeafPaths<T[K]>}`
					: never
		}[keyof T & string];

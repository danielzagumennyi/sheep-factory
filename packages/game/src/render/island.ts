/**
 * The island's edges as its parts are built (Field.top and Field.right): until it grows (ISLAND_GROW) the far row and
 * the east are under the sky. Scene remounts the island's parts when it grows, and each reads them as it builds.
 */
export const island = { top: 0, right: 32 }

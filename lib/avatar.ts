const AVATARS = 8

/** A stable placeholder portrait per person, by their position in the workspace's people list. */
export function avatarFor(index: number): string {
  return `/avatars/a${(Math.max(0, index) % AVATARS) + 1}.jpg`
}

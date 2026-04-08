export const state = {
  museumData: null,
  filteredArtworks: [],
  currentIndex: -1,
  isPlaying: false,
  activeFloor: 'all',
  playbackRate: 1.0,
  resumeTimer: null,
  progressTimer: null,
  utteranceStart: 0,
  utteranceDuration: 0,
};

export function setState(patch) {
  Object.assign(state, patch);
}

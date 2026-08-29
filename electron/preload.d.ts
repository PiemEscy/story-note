export type StoryNoteAPI = Record<string, never>;

declare global {
  interface Window {
    storyNoteAPI: StoryNoteAPI;
  }
}

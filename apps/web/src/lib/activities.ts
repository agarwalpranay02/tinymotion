/** The six activities in the UCI HAR dataset, in the model's output order. */
export const ACTIVITIES = [
  { id: "walking", label: "Walking", short: "Walk", motion: true, line: "Steady steps on level ground." },
  { id: "walking_upstairs", label: "Climbing stairs", short: "Up", motion: true, line: "Walking up a flight of stairs." },
  { id: "walking_downstairs", label: "Going downstairs", short: "Down", motion: true, line: "Walking down a flight of stairs." },
  { id: "sitting", label: "Sitting", short: "Sit", motion: false, line: "Seated, upper body upright." },
  { id: "standing", label: "Standing", short: "Stand", motion: false, line: "Upright and still." },
  { id: "laying", label: "Lying down", short: "Lie", motion: false, line: "Lying flat." },
] as const;

export type ActivityId = (typeof ACTIVITIES)[number]["id"];
export const activityColor = (id: string) => `var(--a-${id})`;
export const activityLabel = (id: string) => ACTIVITIES.find((a) => a.id === id)?.label ?? id;

/** Model variants that ship with the site. */
export const MODELS = [
  {
    id: "tinymotion-anywhere",
    title: "TinyMotion Anywhere",
    blurb: "Trained to ignore which way the phone faces. Powers live recognition on this site.",
    live: true,
  },
  {
    id: "tinymotion-study",
    title: "TinyMotion Study",
    blurb: "Trained for the study's fixed waist position. Highest accuracy on the benchmark.",
    live: false,
  },
  {
    id: "paper-mobilenet1d",
    title: "Paper MobileNet1D",
    blurb: "The MobileNet1D from the WCAIAA 2026 paper, retrained under the same honest protocol for comparison.",
    live: false,
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = "tinymotion-anywhere";

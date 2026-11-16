/** Single source of truth for brand, research facts and links. */
export const SITE = {
  name: "TinyMotion",
  tagline: "AI that knows how you move, small enough for a microcontroller",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://tinymotion.vercel.app",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "tinymotion.app@gmail.com",
  github: "https://github.com/agarwalpranay02/tinymotion",
  founder: "Pranay Agarwal",
} as const;

export const RESEARCH = {
  paper: {
    title: "TinyML-Based Lightweight Deep Learning Model for Human Activity Recognition on Edge Devices",
    venue: "WCAIAA 2026, 7th World Conference on Artificial Intelligence: Advances and Applications, NFSU Goa",
    series: "Springer Lecture Notes in Networks and Systems",
    status: "Accepted; in press",
    year: 2026,
    url: null as string | null,
    conference: "https://www.scrs.in/conference/wcaiaa2026",
  },
  dataset: {
    title: "Human Activity Recognition Using Smartphones",
    authors: "Reyes-Ortiz, J., Anguita, D., Ghio, A., Oneto, L. and Parra, X.",
    year: 2012,
    publisher: "UCI Machine Learning Repository",
    doi: "10.24432/C54S4K",
    url: "https://doi.org/10.24432/C54S4K",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    subjects: 30,
    trainSubjects: 21,
    testSubjects: 9,
    trainWindows: 7352,
    testWindows: 2947,
    device: "Samsung Galaxy S II worn on the waist",
    rateHz: 50,
  },
} as const;

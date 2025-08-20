// Simple JSON-ish list so you can add/edit easily.
// src/data/publications.js
export default [
  {
    id: "gcs-iclr25",
    title:
      "Beyond Single Concept Vector: Modeling Concept Subspace in LLMs with Gaussian Distribution",
    authors:
      "H. Zhao, <strong>H. Zhao</strong>, B. Shen, A. Payani, F. Yang, M. Du",
    venue: "ICLR",
    year: 2025,
    thumb: "/GCS_pic.png",              // <-- thumbnail in /public
    project: "https://hy-zhao23.github.io/projects/gcs/",   // <-- your page
    abstract:
      "We model concept representations in LLMs as distributions rather than single vectors, proposing a Gaussian Concept Subspace (GCS) that captures intra-concept variability and improves concept probing/steering.",
    links: {
      pdf: "https://arxiv.org/pdf/2410.00153",     // replace with direct PDF when available
      code: "https://github.com/hy-zhao23/GCS"                                              // optional
    },
    note: "" // e.g., Spotlight, Oral, Under Review, etc. (optional)
  }
];


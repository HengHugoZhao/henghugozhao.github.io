// Simple JSON-ish list so you can add/edit easily.
// src/data/publications.js
export default [
  {
    id: "probmoe-icml26",
    title:
      "ProbMoE: Differentiable Probabilistic Routing for Mixture-of-Experts",
    authors:
      "<strong>H. Zhao</strong>, Z. Shao, G. Van den Broeck, Z. Zeng",
    venue: "ICML",
    year: 2026,
    thumb: "/probmoe_framework.png",
    project: "/projects/probmoe/",
    abstract:
      "We introduce ProbMoE, a probabilistic routing framework that models expert selection as a distribution over cardinality-constrained expert subsets and formulates routing as probabilistic inference in this discrete subset space. ProbMoE Exact-k achieves strong performance compared to competitive baselines, with improved expert utilization and routing diversity; ProbMoE Dynamic-k achieves comparable performance with fewer activated experts.",
    links: {
      pdf: "https://arxiv.org/abs/2606.01509",
      code: "https://github.com/HengHugoZhao/ProbMoE"
    },
    note: ""
  },
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

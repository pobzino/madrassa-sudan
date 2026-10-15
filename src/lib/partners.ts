export type Partner = {
  id: string;
  name: string;
  nameAr: string;
  // Used where space is tight, such as the footer.
  shortName: string;
  description: string;
  descriptionAr: string;
  url: string;
  logo: { src: string; width: number; height: number; className: string };
  // Matches the logo file's own background so the artwork sits on its intended colour.
  logoBackground: string;
};

export const PARTNERS: Partner[] = [
  {
    id: "waging_peace",
    name: "Waging Peace",
    nameAr: "Waging Peace",
    shortName: "Waging Peace",
    description: "Supports Sudanese asylum-seekers and refugees to build meaningful lives in the UK.",
    descriptionAr: "تدعم طالبي اللجوء واللاجئين السودانيين لبناء حياة كريمة في المملكة المتحدة.",
    url: "https://wagingpeace.info/",
    logo: { src: "/partners/waging-peace-logo.jpg", width: 225, height: 125, className: "h-12 w-auto sm:h-14" },
    logoBackground: "#2e2e2e",
  },
  {
    id: "sdpd",
    name: "Sudan Doctors for Peace & Development",
    nameAr: "أطباء السودان للسلام والتنمية",
    shortName: "SDPD",
    description: "Doctors delivering healthcare, food and education support to displaced Sudanese families.",
    descriptionAr: "أطباء يقدّمون الرعاية الصحية والغذاء ودعم التعليم للأسر السودانية النازحة.",
    url: "https://sdpdev.org/",
    logo: { src: "/partners/sdpd-logo.png", width: 398, height: 88, className: "h-auto w-full max-w-[260px]" },
    logoBackground: "#ffffff",
  },
];

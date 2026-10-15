export type Partner = {
  id: string;
  name: string;
  nameAr: string;
  // Used where space is tight, such as the footer.
  shortName: string;
  url: string;
  logo: { src: string; width: number; height: number; className: string };
  /** Fills the card behind the logo, matching the logo file's own background. */
  logoBackground: string;
};

export const PARTNERS: Partner[] = [
  {
    id: "waging_peace",
    name: "Waging Peace",
    nameAr: "Waging Peace",
    shortName: "Waging Peace",
    url: "https://wagingpeace.info/",
    logo: { src: "/partners/waging-peace-logo.jpg", width: 225, height: 125, className: "h-20 w-auto sm:h-24" },
    // The logo file has its own dark background.
    logoBackground: "#2e2e2e",
  },
  {
    id: "sdpd",
    name: "Sudan Doctors for Peace & Development",
    nameAr: "أطباء السودان للسلام والتنمية",
    shortName: "SDPD",
    url: "https://sdpdev.org/",
    logo: { src: "/partners/sdpd-logo.png", width: 398, height: 88, className: "h-auto w-[88%]" },
    logoBackground: "#ffffff",
  },
];

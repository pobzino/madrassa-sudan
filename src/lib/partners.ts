export type Partner = {
  id: string;
  name: string;
  nameAr: string;
  // Used where space is tight, such as the footer.
  shortName: string;
  url: string;
  logo: { src: string; width: number; height: number; className: string };
};

export const PARTNERS: Partner[] = [
  {
    id: "waging_peace",
    name: "Waging Peace",
    nameAr: "Waging Peace",
    shortName: "Waging Peace",
    url: "https://wagingpeace.info/",
    // The logo file has its own dark background.
    logo: { src: "/partners/waging-peace-logo.jpg", width: 225, height: 125, className: "h-14 w-auto rounded-md sm:h-16" },
  },
  {
    id: "sdpd",
    name: "Sudan Doctors for Peace & Development",
    nameAr: "أطباء السودان للسلام والتنمية",
    shortName: "SDPD",
    url: "https://sdpdev.org/",
    logo: { src: "/partners/sdpd-logo.png", width: 398, height: 88, className: "h-12 w-auto sm:h-14" },
  },
];

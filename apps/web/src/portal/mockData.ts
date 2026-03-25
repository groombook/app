export interface Pet {
  id: string;
  name: string;
  breed: string;
  weight: number;
  dob: string;
  sex: "male" | "female";
  spayedNeutered: boolean;
  photo: string;
  allergies: string;
  skinConditions: string;
  anxietyTriggers: string;
  aggressionNotes: string;
  mobilityIssues: string;
  medications: string;
  preferredCut: string;
  shampooPreference: string;
  sensitiveAreas: string;
  standingInstructions: string;
  vaccinations: Vaccination[];
}

export interface Vaccination {
  name: string;
  lastAdministered: string;
  expirationDate: string;
  status: "valid" | "expiring" | "expired";
  documentUploaded: boolean;
}

export interface Appointment {
  id: string;
  petId: string;
  petName: string;
  groomerId: string;
  groomerName: string;
  services: string[];
  addOns: string[];
  date: string;
  time: string;
  duration: number;
  price: number;
  status: "confirmed" | "pending" | "waitlisted" | "completed" | "cancelled";
  notes: string;
  customerNotes: string;
  reportCardId?: string;
}

export interface ReportCard {
  id: string;
  appointmentId: string;
  petName: string;
  groomerName: string;
  date: string;
  servicesPerformed: string[];
  behaviorMood: "calm" | "anxious" | "wiggly" | "cooperative";
  conditionObservations: string[];
  groomerNote: string;
  nextRecommendedDate: string;
  beforeDescription: string;
  afterDescription: string;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "outstanding" | "overdue";
  items: string[];
}

export interface Message {
  id: string;
  sender: "customer" | "business";
  senderName: string;
  text: string;
  timestamp: string;
  read: boolean;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  priceRange: string;
  isAddOn: boolean;
}

export interface Groomer {
  id: string;
  name: string;
  specialties: string[];
  avatar: string;
}

export interface LoyaltyInfo {
  points: number;
  nextRewardAt: number;
  rewardName: string;
}

export const GROOMERS: Groomer[] = [
  { id: "g1", name: "Jamie", specialties: ["Large breeds", "Dematting"], avatar: "🧑‍🎨" },
  { id: "g2", name: "Alex", specialties: ["Small breeds", "Creative cuts"], avatar: "💇" },
  { id: "g3", name: "Morgan", specialties: ["Anxious pets", "Cats"], avatar: "✂️" },
];

export const SERVICES: Service[] = [
  { id: "s1", name: "Bath & Brush", description: "Full bath, blow-dry, and brush-out", duration: 45, priceRange: "$45–$65", isAddOn: false },
  { id: "s2", name: "Full Groom", description: "Bath, haircut, nail trim, ear cleaning", duration: 90, priceRange: "$75–$120", isAddOn: false },
  { id: "s3", name: "Puppy's First Groom", description: "Gentle introduction to grooming for puppies under 6 months", duration: 60, priceRange: "$55–$70", isAddOn: false },
  { id: "s4", name: "Nail Trim", description: "Quick nail trim and file", duration: 15, priceRange: "$15–$20", isAddOn: false },
  { id: "s5", name: "Teeth Brushing", description: "Enzymatic toothpaste brushing", duration: 10, priceRange: "$10–$15", isAddOn: true },
  { id: "s6", name: "Nail Grinding", description: "Smooth finish with a Dremel tool", duration: 15, priceRange: "$12–$18", isAddOn: true },
  { id: "s7", name: "De-shedding Treatment", description: "Specialized undercoat removal and conditioning", duration: 30, priceRange: "$25–$40", isAddOn: true },
  { id: "s8", name: "Blueberry Facial", description: "Gentle face wash with brightening blueberry formula", duration: 10, priceRange: "$8–$12", isAddOn: true },
];

export const PETS: Pet[] = [
  {
    id: "p1",
    name: "Biscuit",
    breed: "Golden Retriever",
    weight: 65,
    dob: "2022-01-15",
    sex: "male",
    spayedNeutered: true,
    photo: "🐕",
    allergies: "None known",
    skinConditions: "Mild dry skin in winter",
    anxietyTriggers: "None — very calm",
    aggressionNotes: "None",
    mobilityIssues: "None",
    medications: "Monthly heartworm prevention",
    preferredCut: "Teddy bear cut",
    shampooPreference: "Oatmeal-based (sensitive skin)",
    sensitiveAreas: "Ears — prone to irritation",
    standingInstructions: "Extra gentle around ears. Likes treats during nail trim.",
    vaccinations: [
      { name: "Rabies", lastAdministered: "2025-06-10", expirationDate: "2028-06-10", status: "valid", documentUploaded: true },
      { name: "DHPP", lastAdministered: "2025-08-20", expirationDate: "2026-08-20", status: "valid", documentUploaded: true },
      { name: "Bordetella", lastAdministered: "2025-09-01", expirationDate: "2026-09-01", status: "valid", documentUploaded: true },
      { name: "Leptospirosis", lastAdministered: "2025-08-20", expirationDate: "2026-08-20", status: "valid", documentUploaded: false },
    ],
  },
  {
    id: "p2",
    name: "Mochi",
    breed: "Shih Tzu",
    weight: 12,
    dob: "2024-02-28",
    sex: "female",
    spayedNeutered: true,
    photo: "🐩",
    allergies: "Chicken-based products",
    skinConditions: "None",
    anxietyTriggers: "Loud dryers, nail clipping",
    aggressionNotes: "May nip during nail trimming",
    mobilityIssues: "None",
    medications: "None",
    preferredCut: "Puppy cut — even length all over",
    shampooPreference: "Hypoallergenic",
    sensitiveAreas: "Paws — very sensitive to handling",
    standingInstructions: "Use quiet dryer setting. Take breaks during nail trim. Distract with peanut butter mat.",
    vaccinations: [
      { name: "Rabies", lastAdministered: "2025-04-15", expirationDate: "2026-04-15", status: "valid", documentUploaded: true },
      { name: "DHPP", lastAdministered: "2025-04-15", expirationDate: "2026-04-15", status: "valid", documentUploaded: true },
      { name: "Bordetella", lastAdministered: "2025-06-28", expirationDate: "2026-03-28", status: "expiring", documentUploaded: true },
      { name: "Leptospirosis", lastAdministered: "2025-04-15", expirationDate: "2026-04-15", status: "valid", documentUploaded: false },
    ],
  },
];

export const UPCOMING_APPOINTMENTS: Appointment[] = [
  {
    id: "a1", petId: "p1", petName: "Biscuit", groomerId: "g1", groomerName: "Jamie",
    services: ["Full Groom"], addOns: ["De-shedding Treatment"],
    date: "2026-03-21", time: "10:00 AM", duration: 120, price: 145,
    status: "confirmed", notes: "Spring shed is heavy — extra undercoat work needed",
    customerNotes: "",
  },
  {
    id: "a2", petId: "p2", petName: "Mochi", groomerId: "g3", groomerName: "Morgan",
    services: ["Full Groom"], addOns: ["Teeth Brushing"],
    date: "2026-03-25", time: "2:00 PM", duration: 100, price: 90,
    status: "confirmed", notes: "First visit with Morgan — patient with anxious pets",
    customerNotes: "",
  },
  {
    id: "a3", petId: "p1", petName: "Biscuit", groomerId: "g1", groomerName: "Jamie",
    services: ["Bath & Brush"], addOns: [],
    date: "2026-04-18", time: "11:00 AM", duration: 45, price: 55,
    status: "pending", notes: "",
    customerNotes: "",
  },
];

export const PAST_APPOINTMENTS: Appointment[] = [
  {
    id: "pa1", petId: "p1", petName: "Biscuit", groomerId: "g1", groomerName: "Jamie",
    services: ["Full Groom"], addOns: ["De-shedding Treatment", "Blueberry Facial"],
    date: "2026-02-15", time: "10:00 AM", duration: 130, price: 160,
    status: "completed", notes: "", reportCardId: "rc1",
    customerNotes: "",
  },
  {
    id: "pa2", petId: "p2", petName: "Mochi", groomerId: "g2", groomerName: "Alex",
    services: ["Full Groom"], addOns: ["Teeth Brushing"],
    date: "2026-02-20", time: "1:00 PM", duration: 100, price: 88,
    status: "completed", notes: "", reportCardId: "rc2",
    customerNotes: "",
  },
  {
    id: "pa3", petId: "p1", petName: "Biscuit", groomerId: "g1", groomerName: "Jamie",
    services: ["Bath & Brush"], addOns: [],
    date: "2026-01-18", time: "9:00 AM", duration: 45, price: 55,
    status: "completed", notes: "",
    customerNotes: "",
  },
  {
    id: "pa4", petId: "p2", petName: "Mochi", groomerId: "g2", groomerName: "Alex",
    services: ["Puppy's First Groom"], addOns: [],
    date: "2026-01-10", time: "3:00 PM", duration: 60, price: 62,
    status: "completed", notes: "",
    customerNotes: "",
  },
  {
    id: "pa5", petId: "p1", petName: "Biscuit", groomerId: "g1", groomerName: "Jamie",
    services: ["Full Groom"], addOns: ["Nail Grinding"],
    date: "2025-12-20", time: "10:00 AM", duration: 105, price: 132,
    status: "completed", notes: "Holiday groom",
    customerNotes: "",
  },
  {
    id: "pa6", petId: "p1", petName: "Biscuit", groomerId: "g2", groomerName: "Alex",
    services: ["Full Groom"], addOns: [],
    date: "2025-11-15", time: "11:00 AM", duration: 90, price: 110,
    status: "completed", notes: "",
    customerNotes: "",
  },
  {
    id: "pa7", petId: "p2", petName: "Mochi", groomerId: "g3", groomerName: "Morgan",
    services: ["Bath & Brush"], addOns: [],
    date: "2025-11-08", time: "2:00 PM", duration: 45, price: 48,
    status: "completed", notes: "",
    customerNotes: "",
  },
  {
    id: "pa8", petId: "p1", petName: "Biscuit", groomerId: "g1", groomerName: "Jamie",
    services: ["Bath & Brush"], addOns: ["De-shedding Treatment"],
    date: "2025-10-12", time: "10:00 AM", duration: 75, price: 85,
    status: "completed", notes: "",
    customerNotes: "",
  },
];

export const REPORT_CARDS: ReportCard[] = [
  {
    id: "rc1",
    appointmentId: "pa1",
    petName: "Biscuit",
    groomerName: "Jamie",
    date: "2026-02-15",
    servicesPerformed: ["Full Groom", "De-shedding Treatment", "Blueberry Facial"],
    behaviorMood: "calm",
    conditionObservations: [
      "Mild ear wax buildup — recommend ear cleaning solution at home",
      "Slight matting behind ears — addressed during groom",
      "Coat and skin in great overall condition",
    ],
    groomerNote: "Biscuit was an absolute angel today as always! His coat came out beautifully after the de-shedding treatment. The blueberry facial really brightened up his face. He got extra treats for being the best boy. See you next month!",
    nextRecommendedDate: "2026-03-21",
    beforeDescription: "Thick winter coat with moderate shedding, minor matting behind ears, slightly dull facial fur",
    afterDescription: "Fluffy teddy bear cut, smooth and tangle-free, bright clean face, nails trimmed short",
  },
  {
    id: "rc2",
    appointmentId: "pa2",
    petName: "Mochi",
    groomerName: "Alex",
    date: "2026-02-20",
    servicesPerformed: ["Full Groom", "Teeth Brushing"],
    behaviorMood: "anxious",
    conditionObservations: [
      "Tear staining around eyes — may benefit from daily wipe routine",
      "Slight tartar buildup on back molars — consider dental checkup",
      "Paw pads healthy, no cracking",
    ],
    groomerNote: "Mochi was a little nervous today but did so well! We took it slow with the dryer on low setting and gave plenty of breaks. She started to relax halfway through. The teeth brushing went smoothly. She's getting more comfortable each visit — such a brave girl!",
    nextRecommendedDate: "2026-03-25",
    beforeDescription: "Overgrown puppy cut, tear staining visible, coat slightly tangled around legs",
    afterDescription: "Even puppy cut all over, tear stains cleaned, smooth silky coat, fresh and fluffy",
  },
];

export const INVOICES: Invoice[] = [
  { id: "inv1", date: "2026-02-20", amount: 88, status: "outstanding", items: ["Mochi — Full Groom", "Teeth Brushing"] },
  { id: "inv2", date: "2026-02-15", amount: 160, status: "paid", items: ["Biscuit — Full Groom", "De-shedding Treatment", "Blueberry Facial"] },
  { id: "inv3", date: "2026-01-18", amount: 55, status: "paid", items: ["Biscuit — Bath & Brush"] },
  { id: "inv4", date: "2026-01-10", amount: 62, status: "paid", items: ["Mochi — Puppy's First Groom"] },
  { id: "inv5", date: "2025-12-20", amount: 132, status: "paid", items: ["Biscuit — Full Groom", "Nail Grinding"] },
];

export const MESSAGES: Message[] = [
  { id: "m1", sender: "customer", senderName: "Sarah", text: "Hi! Can Biscuit get the same cut as last time on the 21st?", timestamp: "2026-03-16T10:30:00Z", read: true },
  { id: "m2", sender: "business", senderName: "Paws & Reflect", text: "Absolutely, Sarah! Jamie has Biscuit's teddy bear cut notes on file. We'll make sure he looks just as handsome. See you Saturday!", timestamp: "2026-03-16T11:15:00Z", read: true },
  { id: "m3", sender: "customer", senderName: "Sarah", text: "Perfect, thanks! Also, Mochi's Bordetella is expiring soon — should I get that updated before her appointment on the 25th?", timestamp: "2026-03-17T09:00:00Z", read: true },
  { id: "m4", sender: "business", senderName: "Paws & Reflect", text: "Great question! Yes, we require current Bordetella for all grooms. As long as it's updated before the 25th, you're all set. You can upload the new certificate through your pet profile once you have it.", timestamp: "2026-03-17T09:45:00Z", read: false },
];

export const LOYALTY: LoyaltyInfo = {
  points: 340,
  nextRewardAt: 500,
  rewardName: "Free Bath & Brush",
};

export const CUSTOMER = {
  name: "Sarah Mitchell",
  email: "sarah.mitchell@email.com",
  phone: "(555) 234-5678",
  address: "142 Maple Lane, Portland, OR 97201",
};

export const BUSINESS_NAME = "Paws & Reflect Grooming";

export const SAVED_PAYMENT_METHODS = [
  { id: "pm1", type: "visa", last4: "4242", expiry: "09/27", isDefault: true },
  { id: "pm2", type: "mastercard", last4: "8888", expiry: "03/28", isDefault: false },
];

export const SIGNED_AGREEMENTS = [
  { id: "wa1", name: "Liability Waiver", dateSigned: "2025-09-15" },
  { id: "wa2", name: "Service Agreement", dateSigned: "2025-09-15" },
  { id: "wa3", name: "Photo Release", dateSigned: "2025-09-15" },
];

export const PREPAID_PACKAGES = [
  { id: "pkg1", name: "5-Groom Bundle", totalCredits: 5, usedCredits: 3, expiresAt: "2026-09-15" },
];

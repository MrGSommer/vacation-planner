export interface TemplateItem {
  name: string;
  category: string;
  quantity: number;
}

export interface TripType {
  id: string;
  label: string;
  icon: string;
}

export const TRIP_TYPES: TripType[] = [
  { id: 'beach', label: 'Strandurlaub', icon: '🏖️' },
  { id: 'city', label: 'Städtereise', icon: '🏙️' },
  { id: 'backpacking', label: 'Backpacking', icon: '🎒' },
  { id: 'roadtrip', label: 'Roadtrip', icon: '🚗' },
  { id: 'ski', label: 'Skiurlaub', icon: '⛷️' },
  { id: 'hiking', label: 'Wanderurlaub', icon: '🥾' },
];

export const PACKING_TEMPLATES: Record<string, TemplateItem[]> = {
  beach: [
    { name: 'Badehose / Bikini', category: 'Kleidung', quantity: 2 },
    { name: 'Sonnencreme', category: 'Toilettenartikel', quantity: 1 },
    { name: 'Sonnenbrille', category: 'Sonstiges', quantity: 1 },
    { name: 'Strandtuch', category: 'Sonstiges', quantity: 1 },
    { name: 'Flip-Flops', category: 'Kleidung', quantity: 1 },
    { name: 'After-Sun Lotion', category: 'Toilettenartikel', quantity: 1 },
    { name: 'Sonnenhut', category: 'Kleidung', quantity: 1 },
    { name: 'Reisepass', category: 'Dokumente', quantity: 1 },
    { name: 'Ladegerät', category: 'Elektronik', quantity: 1 },
    { name: 'Reiseapotheke', category: 'Medikamente', quantity: 1 },
  ],
  city: [
    { name: 'Bequeme Schuhe', category: 'Kleidung', quantity: 1 },
    { name: 'Regenjacke', category: 'Kleidung', quantity: 1 },
    { name: 'Tagesrucksack', category: 'Sonstiges', quantity: 1 },
    { name: 'Kamera', category: 'Elektronik', quantity: 1 },
    { name: 'Powerbank', category: 'Elektronik', quantity: 1 },
    { name: 'Reisepass / ID', category: 'Dokumente', quantity: 1 },
    { name: 'Reiseführer', category: 'Sonstiges', quantity: 1 },
    { name: 'Ladegerät', category: 'Elektronik', quantity: 1 },
    { name: 'Zahnbürste', category: 'Toilettenartikel', quantity: 1 },
    { name: 'Deodorant', category: 'Toilettenartikel', quantity: 1 },
  ],
  backpacking: [
    { name: 'Rucksack (gross)', category: 'Sonstiges', quantity: 1 },
    { name: 'Schlafsack', category: 'Sonstiges', quantity: 1 },
    { name: 'Schnelltrocknende Kleidung', category: 'Kleidung', quantity: 3 },
    { name: 'Wanderschuhe', category: 'Kleidung', quantity: 1 },
    { name: 'Stirnlampe', category: 'Elektronik', quantity: 1 },
    { name: 'Wasserflsche', category: 'Sonstiges', quantity: 1 },
    { name: 'Reisehandtuch', category: 'Toilettenartikel', quantity: 1 },
    { name: 'Erste-Hilfe-Set', category: 'Medikamente', quantity: 1 },
    { name: 'Reisepass', category: 'Dokumente', quantity: 1 },
    { name: 'Powerbank', category: 'Elektronik', quantity: 1 },
  ],
  roadtrip: [
    { name: 'Führerschein', category: 'Dokumente', quantity: 1 },
    { name: 'Fahrzeugpapiere', category: 'Dokumente', quantity: 1 },
    { name: 'Sonnenbrille', category: 'Sonstiges', quantity: 1 },
    { name: 'Autoladegerät', category: 'Elektronik', quantity: 1 },
    { name: 'Snacks', category: 'Sonstiges', quantity: 1 },
    { name: 'Wasserflasche', category: 'Sonstiges', quantity: 1 },
    { name: 'Kissen / Decke', category: 'Sonstiges', quantity: 1 },
    { name: 'Kamera', category: 'Elektronik', quantity: 1 },
    { name: 'Wechselkleidung', category: 'Kleidung', quantity: 3 },
    { name: 'Toilettenartikel-Set', category: 'Toilettenartikel', quantity: 1 },
  ],
  ski: [
    { name: 'Skijacke', category: 'Kleidung', quantity: 1 },
    { name: 'Skihose', category: 'Kleidung', quantity: 1 },
    { name: 'Thermounterwäsche', category: 'Kleidung', quantity: 2 },
    { name: 'Skihandschuhe', category: 'Kleidung', quantity: 1 },
    { name: 'Skibrille', category: 'Sonstiges', quantity: 1 },
    { name: 'Sonnencreme (Faktor 50)', category: 'Toilettenartikel', quantity: 1 },
    { name: 'Lippenbalsam mit UV', category: 'Toilettenartikel', quantity: 1 },
    { name: 'Helm', category: 'Sonstiges', quantity: 1 },
    { name: 'Skisocken', category: 'Kleidung', quantity: 3 },
    { name: 'Mütze', category: 'Kleidung', quantity: 1 },
  ],
  hiking: [
    { name: 'Wanderschuhe', category: 'Kleidung', quantity: 1 },
    { name: 'Wanderstöcke', category: 'Sonstiges', quantity: 1 },
    { name: 'Regenjacke', category: 'Kleidung', quantity: 1 },
    { name: 'Funktionsshirts', category: 'Kleidung', quantity: 3 },
    { name: 'Tagesrucksack', category: 'Sonstiges', quantity: 1 },
    { name: 'Wasserflasche', category: 'Sonstiges', quantity: 1 },
    { name: 'Trail-Mix / Snacks', category: 'Sonstiges', quantity: 1 },
    { name: 'Sonnencreme', category: 'Toilettenartikel', quantity: 1 },
    { name: 'Erste-Hilfe-Set', category: 'Medikamente', quantity: 1 },
    { name: 'Karte / GPS', category: 'Elektronik', quantity: 1 },
  ],
};

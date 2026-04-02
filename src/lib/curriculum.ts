import type { Json } from "@/lib/database.types";

export type SupportedSubjectKey = "math" | "english";

export type CurriculumFrameworkKey =
  | "cambridge-primary-mathematics-0096"
  | "cambridge-primary-esl-0057";

type StageNumber = 1 | 2 | 3 | 4 | 5 | 6;

type SubjectIdentity = {
  name_ar?: string | null;
  name_en?: string | null;
};

type CurriculumTopicTemplate = {
  id: string;
  strand: string;
  substrand: string;
  promptFocus: string;
  suggestedKeyIdeas: string[];
  stageObjectives: Partial<Record<StageNumber, string>>;
};

type CurriculumFrameworkDefinition = {
  key: CurriculumFrameworkKey;
  title: string;
  code: string;
  subjectKey: SupportedSubjectKey;
  stageRange: readonly StageNumber[];
  topics: readonly CurriculumTopicTemplate[];
};

export interface CurriculumTopicOption {
  frameworkKey: CurriculumFrameworkKey;
  frameworkTitle: string;
  frameworkCode: string;
  subjectKey: SupportedSubjectKey;
  stage: StageNumber;
  topicId: string;
  strand: string;
  substrand: string;
  summary: string;
  promptFocus: string;
  suggestedLearningObjective: string;
  suggestedKeyIdeas: string[];
}

export type CurriculumSelection = CurriculumTopicOption;

const STAGES: readonly StageNumber[] = [1, 2, 3, 4, 5, 6];

const mathTopics: readonly CurriculumTopicTemplate[] = [
  {
    id: "counting-sequences",
    strand: "Number",
    substrand: "Counting and sequences",
    promptFocus:
      "Keep the lesson tightly focused on counting patterns, sequence rules, and age-appropriate number reasoning from the framework.",
    suggestedKeyIdeas: [
      "counting and counting back",
      "recognising and extending patterns",
      "sequence rules",
      "using patterns to predict next terms",
    ],
    stageObjectives: {
      1: "Count, estimate and describe simple number sequences within 20, including count-on and count-back routines.",
      2: "Count within 100 and recognise, describe and extend simple numerical sequences using ones, twos, fives and tens.",
      3: "Estimate within 1000, count in constant steps and extend linear and spatial patterns using clear term-to-term rules.",
      4: "Count forward and backward through positive and negative numbers, and extend linear and non-linear sequences.",
      5: "Use repeated addition and multiplication to find terms in linear sequences and extend square and triangular number patterns.",
      6: "Count in whole numbers, fractions and decimals, and use position-to-term rules for sequences that extend beyond zero.",
    },
  },
  {
    id: "integers-and-powers",
    strand: "Number",
    substrand: "Integers and powers",
    promptFocus:
      "Stay within the stage-specific operations, fluency and number-law work from the framework. Do not introduce later-stage procedures.",
    suggestedKeyIdeas: [
      "addition and subtraction strategies",
      "multiplication and division meaning",
      "number laws and efficient methods",
      "facts, factors and multiples",
    ],
    stageObjectives: {
      1: "Understand addition and subtraction within 20, complements of 10, and doubles up to double 10.",
      2: "Add and subtract 2-digit numbers without regrouping, introduce multiplication and division, and use the 1, 2, 5 and 10 times tables.",
      3: "Work with whole numbers to 1000, including regrouping, multiplication and division facts, and times tables through 10.",
      4: "Use all times tables to 10, multiply and divide whole numbers, and apply factors, multiples and divisibility knowledge.",
      5: "Estimate and calculate with integers including negatives, apply order of operations, and work with prime, composite and square numbers.",
      6: "Estimate and calculate with integers, brackets, common factors and multiples, divisibility tests and cube numbers.",
    },
  },
  {
    id: "money",
    strand: "Number",
    substrand: "Money",
    promptFocus:
      "Use only the money knowledge explicitly present at this stage, grounded in local currency recognition, value and change.",
    suggestedKeyIdeas: [
      "recognising coins or notes",
      "comparing values",
      "reading money notation",
      "calculating simple change",
    ],
    stageObjectives: {
      1: "Recognise money used in the local currency.",
      2: "Recognise money notation and compare different combinations of coins and notes.",
      3: "Interpret decimal money notation and add or subtract money amounts to find totals and change.",
    },
  },
  {
    id: "place-value-ordering-rounding",
    strand: "Number",
    substrand: "Place value, ordering and rounding",
    promptFocus:
      "Keep explanations anchored to place value, comparison and rounding at the selected stage, using representations and language suited to the learner age.",
    suggestedKeyIdeas: [
      "digit value depends on position",
      "composing and decomposing numbers",
      "ordering numbers",
      "rounding to an appropriate place",
    ],
    stageObjectives: {
      1: "Understand zero, compose and compare numbers to 20, and use simple ordinal numbers.",
      2: "Use place value in 2-digit numbers, compare and order them, and round to the nearest 10.",
      3: "Use place value in 3-digit numbers, compare and order them with symbols, and round to the nearest 10 or 100.",
      4: "Work with larger whole numbers and negative numbers, and round to powers of ten up to 100 000.",
      5: "Use place value with tenths and hundredths, regroup decimals, and round to the nearest whole number.",
      6: "Use place value with tenths, hundredths and thousandths, regroup decimals, and round to the nearest tenth or whole number.",
    },
  },
  {
    id: "fractions-decimals-percentages-ratio-proportion",
    strand: "Number",
    substrand: "Fractions, decimals, percentages, ratio and proportion",
    promptFocus:
      "Stay inside the exact fraction, decimal, percentage, ratio or proportion concepts named for the chosen stage.",
    suggestedKeyIdeas: [
      "equal parts and whole-part relationships",
      "equivalence",
      "fractions as operators or division",
      "comparing representations",
    ],
    stageObjectives: {
      1: "Explore halves as equal parts of shapes, quantities and sets, including halves as operators and wholes made from halves.",
      2: "Explore halves, quarters and three-quarters as equal parts, division interpretations and simple equivalence.",
      3: "Work with unit fractions and common fractions, equivalence, comparing fractions and adding or subtracting like fractions.",
      4: "Work with proper fractions and equivalent fractions, add or subtract like fractions, and introduce percentage as parts per hundred.",
      5: "Link proper and improper fractions, decimals and percentages, and introduce ratio and proportion alongside fraction operations.",
      6: "Simplify fractions, compare fractions, decimals and percentages, operate on unlike fractions and use direct proportion and equivalent ratios.",
    },
  },
  {
    id: "time",
    strand: "Geometry and Measure",
    substrand: "Time",
    promptFocus:
      "Use clock, timetable and interval work only at the precision level named in the selected stage.",
    suggestedKeyIdeas: [
      "units of time",
      "reading clocks or notation",
      "interpreting calendars and timetables",
      "finding time intervals",
    ],
    stageObjectives: {
      1: "Use familiar time language, know days and months, and recognise time to the hour and half hour.",
      2: "Order units of time, read time to five minutes and interpret calendar information.",
      3: "Read 12-hour clocks, interpret timetables and distinguish between clock times and time intervals.",
      4: "Convert between units of time, use 12- and 24-hour notation and find intervals across common units.",
      5: "Work with sub-second ideas, time zones and intervals that bridge through 60.",
      6: "Convert time intervals between decimal and mixed-unit forms.",
    },
  },
  {
    id: "geometrical-reasoning-shapes-measurements",
    strand: "Geometry and Measure",
    substrand: "Geometrical reasoning, shapes and measurements",
    promptFocus:
      "Keep shape, measurement and angle work within the framework scope for the stage. Use concrete visual models before abstraction.",
    suggestedKeyIdeas: [
      "2D and 3D shape properties",
      "measuring and estimating",
      "perimeter, area or volume as appropriate",
      "symmetry and angle language",
    ],
    stageObjectives: {
      1: "Identify and sort basic 2D and 3D shapes, compare length, mass and capacity, and explore simple measurement language.",
      2: "Classify 2D and 3D shapes, measure familiar attributes, explore symmetry, turns and reading scales.",
      3: "Classify regular and irregular shapes, estimate and measure metric quantities, and introduce perimeter, area, symmetry and right-angle comparisons.",
      4: "Investigate combined shapes, area and perimeter of rectangles and compound shapes, nets, symmetry and acute, right or obtuse angles.",
      5: "Classify triangles, compare perimeter and area, work with compound shapes, nets, reflective symmetry and angle sums on a straight line.",
      6: "Classify quadrilaterals and circles, estimate area of right-angled triangles, compare capacity and volume, work with nets, rotational symmetry and triangle angle sums.",
    },
  },
  {
    id: "position-and-transformation",
    strand: "Geometry and Measure",
    substrand: "Position and transformation",
    promptFocus:
      "Use movement, coordinates and transformation language exactly at the stage level selected.",
    suggestedKeyIdeas: [
      "describing position and direction",
      "using coordinates",
      "reflection, translation or rotation",
      "matching original and image points",
    ],
    stageObjectives: {
      1: "Use familiar language to describe position and direction.",
      2: "Describe movement and sketch reflections in a vertical mirror line.",
      3: "Describe movement using cardinal points and reflect shapes in horizontal or vertical mirror lines.",
      4: "Use coordinate notation in the first quadrant and reflect shapes on square grids.",
      5: "Plot points and lines in the first quadrant, compare coordinates, translate shapes and reflect patterns.",
      6: "Read and plot coordinates in all four quadrants, and translate, reflect and rotate shapes on grids.",
    },
  },
  {
    id: "statistics",
    strand: "Statistics and Probability",
    substrand: "Statistics",
    promptFocus:
      "Keep the enquiry cycle, representations and data interpretation within the stage-specific framework expectations.",
    suggestedKeyIdeas: [
      "asking statistical questions",
      "collecting and organising data",
      "choosing a representation",
      "interpreting and discussing conclusions",
    ],
    stageObjectives: {
      1: "Represent categorical data using practical resources, tables, diagrams and simple graphs, and describe what the data shows.",
      2: "Conduct simple investigations with categorical data, choose suitable representations and describe similarities or differences.",
      3: "Investigate categorical and discrete data using tables, pictograms and bar charts, and interpret patterns in the results.",
      4: "Plan investigations for categorical and discrete data, use a wider range of charts including dot plots, and discuss conclusions and variation.",
      5: "Handle categorical, discrete and continuous data, choose representations, and interpret mode and median where appropriate.",
      6: "Plan and conduct related statistical investigations, use a broad range of graphs, and interpret mode, median, mean and range.",
    },
  },
  {
    id: "probability",
    strand: "Statistics and Probability",
    substrand: "Probability",
    promptFocus:
      "Keep chance language, experiments and conclusions at the selected stage. Do not jump to formal probability methods from later stages.",
    suggestedKeyIdeas: [
      "chance language",
      "predicting outcomes",
      "running experiments or simulations",
      "describing likelihood",
    ],
    stageObjectives: {
      2: "Use basic language of randomness and run simple chance experiments with two outcomes.",
      3: "Describe events with everyday chance language and present the results of chance experiments.",
      4: "Use maybe, likely, certain and impossible, and compare small and large numbers of trials.",
      5: "Compare likelihood and risk, recognise equally likely outcomes and analyse experimental results.",
      6: "Use formal probability and proportion language, recognise mutually exclusive events and analyse large-trial experiments or simulations.",
    },
  },
];

const eslTopics: readonly CurriculumTopicTemplate[] = [
  {
    id: "listening-global-meaning",
    strand: "Listening",
    substrand: "Listening for global meaning",
    promptFocus:
      "Focus on helping learners grasp the main point of spoken English at the selected stage, using simple, classroom-friendly listening tasks.",
    suggestedKeyIdeas: [
      "listening for topic or theme",
      "identifying the speaker or audience",
      "noticing the main point",
      "using support appropriately",
    ],
    stageObjectives: {
      1: "Understand the main point of short talk with support.",
      2: "Understand the main point of short talk with little or no support.",
      3: "Understand some of the main points of short talk with support.",
      4: "Understand most of the main points of short talk with support.",
      5: "Understand most of the main points of short talk with little or no support.",
      6: "Understand most of the main points of short and extended talk with support.",
    },
  },
  {
    id: "listening-detail",
    strand: "Listening",
    substrand: "Listening for detail",
    promptFocus:
      "Use short spoken input to build listening accuracy for instructions, questions, specific information and meaning from context.",
    suggestedKeyIdeas: [
      "following instructions",
      "answering spoken questions",
      "hearing specific information",
      "using context to infer meaning",
    ],
    stageObjectives: {
      1: "Recognise simple spelled words, follow short instructions and questions, and understand some specific information with support.",
      2: "Follow short familiar instructions and questions, and understand some specific information with little or no support.",
      3: "Follow a limited range of familiar instructions and questions and understand most specific information in short talk.",
      4: "Understand a wider range of instructions and questions and deduce meaning in short talk with increasing independence.",
      5: "Understand a range of instructions, questions and specific detail in short talk with little or no support.",
      6: "Understand detailed information, arguments and context clues in short and extended talk with support.",
    },
  },
  {
    id: "listening-opinion",
    strand: "Listening",
    substrand: "Listening for opinion",
    promptFocus:
      "Train learners to notice spoken opinions and feelings without drifting into advanced text analysis beyond the selected stage.",
    suggestedKeyIdeas: [
      "spotting opinions in speech",
      "noticing feelings and attitudes",
      "distinguishing fact from opinion",
      "responding to viewpoints",
    ],
    stageObjectives: {
      3: "Recognise the speaker's opinions in short talk with support.",
      4: "Recognise the speaker's opinions in short talk with little or no support.",
      5: "Recognise opinions in short talk with growing confidence.",
      6: "Recognise opinions in short and extended talk with support.",
    },
  },
  {
    id: "speaking-communication",
    strand: "Speaking",
    substrand: "Communication",
    promptFocus:
      "Build short, useful spoken English for real classroom communication, keeping grammar and sentence length appropriate to the stage.",
    suggestedKeyIdeas: [
      "giving personal or factual information",
      "describing people, places and events",
      "asking and answering questions",
      "clear pronunciation and spoken confidence",
    ],
    stageObjectives: {
      1: "Give basic personal information, describe familiar people or objects, and ask simple questions using words and short phrases.",
      2: "Give personal information and descriptions using phrases and short sentences, and ask simple questions more independently.",
      3: "Give information and descriptions in sentences, ask for general information and maintain short exchanges.",
      4: "Speak in short sequences of sentences to describe people, places and actions and ask questions on an increasing range of topics.",
      5: "Give more detailed information in sequences of sentences and maintain a range of exchanges on familiar topics.",
      6: "Give detailed information, clarify meaning, give instructions and sustain longer stretches of spoken language.",
    },
  },
  {
    id: "speaking-express-opinion",
    strand: "Speaking",
    substrand: "Express opinion",
    promptFocus:
      "Keep opinion work concrete and personal, using feeling and reaction language that matches the stage.",
    suggestedKeyIdeas: [
      "expressing likes and dislikes",
      "sharing feelings",
      "giving simple reasons",
      "reacting to ideas or events",
    ],
    stageObjectives: {
      2: "Express basic feelings with support.",
      3: "Express basic opinions and feelings with support.",
      4: "Express opinions and feelings with support.",
      5: "Express opinions and feelings with little or no support.",
      6: "Express opinions, feelings and reactions with increasing clarity.",
    },
  },
  {
    id: "speaking-organisation",
    strand: "Speaking",
    substrand: "Organisation",
    promptFocus:
      "Use connectives, turn-taking and interaction routines from the framework to help learners organise spoken English.",
    suggestedKeyIdeas: [
      "linking ideas with connectives",
      "taking turns",
      "starting and maintaining exchanges",
      "closing interactions clearly",
    ],
    stageObjectives: {
      1: "Link words and phrases with basic connectives and take turns in short basic exchanges.",
      2: "Link words and phrases with basic connectives and take turns across a wider set of short exchanges.",
      3: "Link words and phrases using basic connectives and initiate or maintain short interactions with support.",
      4: "Link short sequences of simple sentences and initiate, maintain and conclude interactions with some support.",
      5: "Link short sequences of sentences with an increasing range of connectives and manage exchanges with little or no support.",
      6: "Link sentences with an increasing range of connectives and briefly summarise others' ideas to reach shared outcomes.",
    },
  },
  {
    id: "writing-communicative-achievement",
    strand: "Writing",
    substrand: "Communicative achievement",
    promptFocus:
      "Build stage-appropriate writing fluency, accuracy and drafting habits, from letter formation through short text production.",
    suggestedKeyIdeas: [
      "clear handwriting and spelling",
      "forming words and sentences",
      "planning and checking writing",
      "using stage-appropriate grammar",
    ],
    stageObjectives: {
      1: "Write letters and familiar words left to right, form upper and lower case letters, and begin simple grammatical writing.",
      2: "Write letters and words with consistent size and spacing and plan short phrases or sentences with support.",
      3: "Use legible handwriting, spell most simple high-frequency words and plan, write and check sentences with support.",
      4: "Use legible writing with some speed, spell most high-frequency words accurately and draft a short paragraph with support.",
      5: "Write legibly with growing speed, spell high-frequency words accurately and plan, edit and proofread short texts with support.",
      6: "Write legibly with appropriate speed and fluency, spell familiar words accurately and plan, edit and proofread short texts more independently.",
    },
  },
  {
    id: "writing-organisation",
    strand: "Writing",
    substrand: "Organisation",
    promptFocus:
      "Stay within the writing organisation skills named in the framework: punctuation, connectives, paragraphs and layout as appropriate.",
    suggestedKeyIdeas: [
      "basic punctuation",
      "linking ideas with connectives",
      "organising into sentences or paragraphs",
      "using suitable layout",
    ],
    stageObjectives: {
      2: "Use basic punctuation and link words, phrases and short sentences with support.",
      3: "Use basic punctuation with some accuracy and link words, phrases and short sentences with little or no support.",
      4: "Punctuate paragraphs with some accuracy, link sentences into a paragraph and use simple genre layout with support.",
      5: "Punctuate short texts, organise them into paragraphs and use genre layout with little or no support.",
      6: "Punctuate short texts independently, organise paragraphs clearly and use appropriate layout for familiar genres.",
    },
  },
  {
    id: "writing-content",
    strand: "Writing",
    substrand: "Content",
    promptFocus:
      "Use short written tasks that match the curriculum genres and purposes, such as personal information, descriptions, instructions and opinions.",
    suggestedKeyIdeas: [
      "writing for a clear purpose",
      "describing people, places or events",
      "writing instructions",
      "expressing opinions or feelings",
    ],
    stageObjectives: {
      1: "Write words and short, simple phrases to give personal and factual information.",
      2: "Write simple phrases to give personal and factual information and express basic feelings with support.",
      3: "Write short instructions, descriptions and basic opinions or feelings with support.",
      4: "Write short sequences of instructions, descriptions and opinions or feelings with support.",
      5: "Write short sequences of instructions, descriptions and opinions or feelings with little or no support.",
      6: "Write sequences of instructions and short descriptive or opinion-based texts with growing independence.",
    },
  },
  {
    id: "reading-global-meaning",
    strand: "Reading",
    substrand: "Reading for global meaning",
    promptFocus:
      "Focus on finding the main point, topic or purpose in short texts before moving into detailed analysis.",
    suggestedKeyIdeas: [
      "finding the main idea",
      "recognising text purpose",
      "reading short fiction and non-fiction",
      "building reading confidence",
    ],
    stageObjectives: {
      2: "Understand the main point of short, simple texts and begin reading short fiction and non-fiction texts with support.",
      3: "Understand the main point of short, simple texts with little or no support and read a limited range confidently.",
      4: "Understand some of the main points of short, simple texts and read an increasing range with support.",
      5: "Understand most of the main points of short texts and read a range of short fiction and non-fiction texts with little or no support.",
      6: "Understand most of the main points of short and extended texts and read a range of texts independently with confidence and enjoyment.",
    },
  },
  {
    id: "reading-detail",
    strand: "Reading",
    substrand: "Reading for detail",
    promptFocus:
      "Use decoding, instruction-following and detail retrieval tasks that fit the stage, from illustrated texts to short extended texts.",
    suggestedKeyIdeas: [
      "recognising words or sound patterns",
      "reading for specific information",
      "following instructions",
      "deducing meaning from context",
    ],
    stageObjectives: {
      1: "Recognise letters and sounds, understand simple words in illustrated texts and deduce meaning from pictures with support.",
      2: "Recognise and read simple words or phrases, understand specific information and follow short familiar instructions with support.",
      3: "Understand most specific information in short texts, follow short familiar instructions and deduce meaning from context with support.",
      4: "Understand most specific information in short texts, follow an increasing range of instructions and explore word roots.",
      5: "Understand most specific information in short texts, follow a range of instructions and compare words with common roots.",
      6: "Understand most specific information and arguments in short and extended texts, follow instructions and explore idiomatic phrases.",
    },
  },
  {
    id: "reading-opinion",
    strand: "Reading",
    substrand: "Reading for opinion",
    promptFocus:
      "Keep opinion-reading tasks short and explicit, helping learners identify what the writer thinks or feels.",
    suggestedKeyIdeas: [
      "spotting opinions in writing",
      "noticing attitude or feeling words",
      "separating fact and opinion",
      "responding to viewpoint",
    ],
    stageObjectives: {
      3: "Recognise the writer's opinions in short, simple texts with support.",
      4: "Recognise the writer's opinions in short, simple texts with little or no support.",
      5: "Recognise the writer's opinions in short texts with growing confidence.",
      6: "Recognise the writer's opinions in short and extended texts with support.",
    },
  },
  {
    id: "use-of-english-grammatical-forms",
    strand: "Use of English",
    substrand: "Grammatical forms",
    promptFocus:
      "Teach the grammar listed for the chosen stage through practical communication, not abstract grammar lectures.",
    suggestedKeyIdeas: [
      "target grammar in context",
      "accurate sentence building",
      "question and answer patterns",
      "spoken and written application",
    ],
    stageObjectives: {
      1: "Use familiar question words, common present forms, present continuous, can or can't, adjectives and possessive adjectives in simple contexts.",
      2: "Use question forms, present and past simple, present continuous, will, can for requests, and basic adjectives in familiar contexts.",
      3: "Use present, past and present continuous forms, begin present perfect, use modal verbs like must and could, and build simple comparisons.",
      4: "Use tag questions, offers or invitations, imperative forms, present and past continuous, present perfect and future forms with increasing control.",
      5: "Use an increasing range of present, past, continuous and perfect forms, zero conditionals and polite modal requests.",
      6: "Use wider question forms, active and beginning passive forms, perfect and future forms, first conditionals, prepositional verbs and simple reported speech.",
    },
  },
  {
    id: "use-of-english-vocabulary",
    strand: "Use of English",
    substrand: "Vocabulary",
    promptFocus:
      "Keep vocabulary work practical and stage-appropriate, using the categories emphasised in the framework for that stage.",
    suggestedKeyIdeas: [
      "topic vocabulary",
      "numbers, prepositions and adverbs",
      "noun forms and word groups",
      "accurate vocabulary choice in context",
    ],
    stageObjectives: {
      1: "Use numbers to 20, ordinal numbers to 10th, simple prepositions, adverbs of place and common nouns in familiar contexts.",
      2: "Use numbers to 100, wider prepositions, time adverbs, -ly adverbs, common nouns and basic irregular plurals.",
      3: "Use numbers to 1000, prepositions of origin and position, adverbs of time, sequence, direction and manner, and countable nouns in context.",
      4: "Use direction prepositions, adverbs of indefinite time, comparative adverbs and an increasing range of countable and uncountable nouns.",
      5: "Use dependent prepositions, a wider range of prepositions and adverbs, abstract nouns and compound nouns in familiar topics.",
      6: "Use dependent prepositions, manner expressions, a wide range of time adverbs, collective nouns, abstract nouns and compound nouns.",
    },
  },
  {
    id: "use-of-english-sentence-structure",
    strand: "Use of English",
    substrand: "Sentence structure",
    promptFocus:
      "Keep sentence-building within the curriculum patterns for the stage, focusing on clarity, control and meaningful use.",
    suggestedKeyIdeas: [
      "pronouns and determiners",
      "connectives",
      "quantifiers",
      "subordinate or relative clauses where appropriate",
    ],
    stageObjectives: {
      1: "Use articles, demonstratives, common pronouns, and the connective and to build simple sentences.",
      2: "Use demonstratives, possessive pronouns and simple connectives such as but, or and then.",
      3: "Use quantifiers, demonstratives, direct and indirect pronouns, because, and simple infinitive or gerund patterns.",
      4: "Use wider quantifiers, indefinite pronouns, time connectives, relative clauses and subordinate clauses for present and past actions.",
      5: "Use a range of quantifiers, indefinite pronouns, connectives, relative clauses and subordinate clauses following think, know, believe or hope.",
      6: "Use wide-ranging quantifiers, reciprocal and reflexive pronouns, richer connectives, more advanced relative clauses and verb plus object patterns.",
    },
  },
];

const frameworks: readonly CurriculumFrameworkDefinition[] = [
  {
    key: "cambridge-primary-mathematics-0096",
    title: "Cambridge Primary Mathematics",
    code: "0096",
    subjectKey: "math",
    stageRange: STAGES,
    topics: mathTopics,
  },
  {
    key: "cambridge-primary-esl-0057",
    title: "Cambridge Primary English as a Second Language",
    code: "0057",
    subjectKey: "english",
    stageRange: STAGES,
    topics: eslTopics,
  },
];

function normaliseSubjectName(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function resolveSupportedSubject(subject: SubjectIdentity | null | undefined): SupportedSubjectKey | null {
  const englishText = `${normaliseSubjectName(subject?.name_en)} ${normaliseSubjectName(subject?.name_ar)}`;

  if (
    englishText.includes("math") ||
    englishText.includes("mathematics") ||
    englishText.includes("رياض") ||
    englishText.includes("الرياضيات")
  ) {
    return "math";
  }

  if (
    englishText.includes("english") ||
    englishText.includes("esl") ||
    englishText.includes("إنج") ||
    englishText.includes("الانجليزية") ||
    englishText.includes("الإنجليزية")
  ) {
    return "english";
  }

  return null;
}

export function getSupportedSubjectKey(
  subject: SubjectIdentity | null | undefined
): SupportedSubjectKey | null {
  return resolveSupportedSubject(subject);
}

function getFrameworkForSubject(subject: SubjectIdentity | null | undefined): CurriculumFrameworkDefinition | null {
  const subjectKey = resolveSupportedSubject(subject);
  if (!subjectKey) {
    return null;
  }

  return frameworks.find((framework) => framework.subjectKey === subjectKey) ?? null;
}

function toStage(gradeLevel: number | null | undefined): StageNumber | null {
  if (gradeLevel == null || !Number.isFinite(gradeLevel)) {
    return null;
  }

  if (gradeLevel < 1 || gradeLevel > 6) {
    return null;
  }

  return gradeLevel as StageNumber;
}

export function getCurriculumTopicOptions(
  subject: SubjectIdentity | null | undefined,
  gradeLevel: number | null | undefined
): CurriculumTopicOption[] {
  const framework = getFrameworkForSubject(subject);
  const stage = toStage(gradeLevel);

  if (!framework || !stage || !framework.stageRange.includes(stage)) {
    return [];
  }

  return framework.topics
    .filter((topic) => topic.stageObjectives[stage])
    .map((topic) => ({
      frameworkKey: framework.key,
      frameworkTitle: framework.title,
      frameworkCode: framework.code,
      subjectKey: framework.subjectKey,
      stage,
      topicId: topic.id,
      strand: topic.strand,
      substrand: topic.substrand,
      summary: topic.stageObjectives[stage] || "",
      promptFocus: topic.promptFocus,
      suggestedLearningObjective: topic.stageObjectives[stage] || "",
      suggestedKeyIdeas: topic.suggestedKeyIdeas,
    }));
}

export function getCurriculumSelectionKey(selection: Pick<CurriculumSelection, "frameworkKey" | "stage" | "topicId">): string {
  return `${selection.frameworkKey}:${selection.stage}:${selection.topicId}`;
}

export function parseCurriculumSelection(value: unknown): CurriculumSelection | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const frameworkKey =
    candidate.frameworkKey === "cambridge-primary-mathematics-0096" ||
    candidate.frameworkKey === "cambridge-primary-esl-0057"
      ? candidate.frameworkKey
      : null;
  const stage = toStage(typeof candidate.stage === "number" ? candidate.stage : null);
  const topicId = typeof candidate.topicId === "string" ? candidate.topicId : null;

  if (!frameworkKey || !stage || !topicId) {
    return null;
  }

  const framework = frameworks.find((entry) => entry.key === frameworkKey);
  const topic = framework?.topics.find((entry) => entry.id === topicId);
  const summary = topic?.stageObjectives[stage];

  if (!framework || !topic || !summary) {
    return null;
  }

  return {
    frameworkKey,
    frameworkTitle: framework.title,
    frameworkCode: framework.code,
    subjectKey: framework.subjectKey,
    stage,
    topicId,
    strand: topic.strand,
    substrand: topic.substrand,
    summary,
    promptFocus: topic.promptFocus,
    suggestedLearningObjective: summary,
    suggestedKeyIdeas: topic.suggestedKeyIdeas,
  };
}

export function getCurriculumSelectionForLesson(
  subject: SubjectIdentity | null | undefined,
  gradeLevel: number | null | undefined,
  value: unknown
): CurriculumSelection | null {
  const parsed = parseCurriculumSelection(value);
  if (!parsed) {
    return null;
  }

  const options = getCurriculumTopicOptions(subject, gradeLevel);
  return (
    options.find((option) => getCurriculumSelectionKey(option) === getCurriculumSelectionKey(parsed)) ??
    null
  );
}

export function hasMappedCurriculum(
  subject: SubjectIdentity | null | undefined,
  gradeLevel: number | null | undefined
): boolean {
  return getCurriculumTopicOptions(subject, gradeLevel).length > 0;
}

export function getCurriculumRequirementMessage(
  subject: SubjectIdentity | null | undefined,
  gradeLevel: number | null | undefined,
  selection: CurriculumSelection | null | undefined
): string | null {
  if (!hasMappedCurriculum(subject, gradeLevel)) {
    return null;
  }

  return selection ? null : "Select a curriculum topic before using AI generation for this lesson.";
}

export function getCurriculumPromptBlock(selection: CurriculumSelection | null): string {
  if (!selection) {
    return "## Curriculum Constraint\n- No mapped curriculum topic was selected.";
  }

  const keyIdeas =
    selection.suggestedKeyIdeas.length > 0
      ? selection.suggestedKeyIdeas.map((idea) => `  - ${idea}`).join("\n")
      : "  - none provided";

  return `## Curriculum Constraint
- Framework: ${selection.frameworkTitle} (${selection.frameworkCode})
- Stage: ${selection.stage}
- Strand: ${selection.strand}
- Curriculum topic: ${selection.substrand}
- Stage-specific objective: ${selection.suggestedLearningObjective}
- Keep the lesson strictly within this curriculum topic and stage.
- Only include prerequisite recap when absolutely necessary to support this topic.
- Curriculum focus guidance: ${selection.promptFocus}
- Suggested key ideas:
${keyIdeas}`;
}

export function serializeCurriculumSelection(selection: CurriculumSelection | null): Json | null {
  if (!selection) {
    return null;
  }

  return {
    frameworkKey: selection.frameworkKey,
    frameworkTitle: selection.frameworkTitle,
    frameworkCode: selection.frameworkCode,
    subjectKey: selection.subjectKey,
    stage: selection.stage,
    topicId: selection.topicId,
    strand: selection.strand,
    substrand: selection.substrand,
    summary: selection.summary,
    promptFocus: selection.promptFocus,
    suggestedLearningObjective: selection.suggestedLearningObjective,
    suggestedKeyIdeas: selection.suggestedKeyIdeas,
  };
}

"use client";

import { useState } from "react";
import {
  OwlDuoStyle,
  OwlTutorIcon,
  OwlWaving,
  OwlCelebrating,
  OwlThinking,
  OwlSad,
  OwlReading,
  OwlExcited,
  OwlSleeping,
  OwlPointing,
  OwlConfused,
  OwlEncouraging,
  OwlHead,
  OwlTeacher,
  OwlWriting,
  OwlCorrect,
  OwlWrong,
  OwlStreak,
  OwlMedal,
  OwlWelcome,
  OwlBye,
  OwlMath,
  OwlScience,
  OwlEnglish,
  Confetti,
  ConfettiBurst,
  MadrassaLogo,
  SecretaryBirdIcon,
  MadrassaBirdLogo,
} from "@/components/illustrations";

export default function OwlShowcasePage() {
  const [showConfetti, setShowConfetti] = useState(false);

  const owls = [
    // Core owls
    {
      name: "Duo Style (TEST)",
      description: "Wings integrated into body silhouette like Duolingo",
      component: OwlDuoStyle,
      usage: "Testing new style",
      category: "Core",
    },
    {
      name: "Owl Tutor",
      description: "The main mascot - wise owl with graduation cap",
      component: OwlTutorIcon,
      usage: "Logo, branding, navigation",
      category: "Core",
    },
    {
      name: "Owl Head",
      description: "Simplified owl face for compact spaces",
      component: OwlHead,
      usage: "Favicons, small icons, avatars",
      category: "Core",
    },
    // Emotions & States
    {
      name: "Owl Waving",
      description: "Friendly greeting pose with animated wing",
      component: OwlWaving,
      usage: "Welcome screens, greetings",
      category: "Emotions",
    },
    {
      name: "Owl Celebrating",
      description: "Happy bouncing owl with sparkles",
      component: OwlCelebrating,
      usage: "Achievements, completions",
      category: "Emotions",
    },
    {
      name: "Owl Thinking",
      description: "Looking up with animated thought bubbles",
      component: OwlThinking,
      usage: "Loading states, AI processing",
      category: "Emotions",
    },
    {
      name: "Owl Sad",
      description: "Droopy ears and tilted cap",
      component: OwlSad,
      usage: "Empty states, errors",
      category: "Emotions",
    },
    {
      name: "Owl Excited",
      description: "Wide eyes with animated sparkle stars",
      component: OwlExcited,
      usage: "Rewards, milestones, surprises",
      category: "Emotions",
    },
    {
      name: "Owl Sleeping",
      description: "Eyes closed with animated zzz",
      component: OwlSleeping,
      usage: "Inactive states, night mode",
      category: "Emotions",
    },
    {
      name: "Owl Confused",
      description: "Tilted head with question mark",
      component: OwlConfused,
      usage: "Help pages, FAQs, unclear content",
      category: "Emotions",
    },
    {
      name: "Owl Encouraging",
      description: "Thumbs up with heart",
      component: OwlEncouraging,
      usage: "Motivation, support messages",
      category: "Emotions",
    },
    // Actions
    {
      name: "Owl Reading",
      description: "Holding an open book",
      component: OwlReading,
      usage: "Lessons, study content",
      category: "Actions",
    },
    {
      name: "Owl Pointing",
      description: "Wing pointing to the side",
      component: OwlPointing,
      usage: "Tips, hints, callouts",
      category: "Actions",
    },
    {
      name: "Owl Teacher",
      description: "Pointing at chalkboard with pointer",
      component: OwlTeacher,
      usage: "Teaching moments, explanations",
      category: "Actions",
    },
    {
      name: "Owl Writing",
      description: "Holding pencil over paper",
      component: OwlWriting,
      usage: "Homework, assignments, notes",
      category: "Actions",
    },
    // Feedback
    {
      name: "Owl Correct",
      description: "Happy with green checkmark and thumbs up",
      component: OwlCorrect,
      usage: "Correct answers, success",
      category: "Feedback",
    },
    {
      name: "Owl Wrong",
      description: "Encouraging with red X (gentle)",
      component: OwlWrong,
      usage: "Wrong answers (non-discouraging)",
      category: "Feedback",
    },
    // Achievements
    {
      name: "Owl Streak",
      description: "Standing in animated fire flames",
      component: OwlStreak,
      usage: "Streak achievements, hot streaks",
      category: "Achievements",
    },
    {
      name: "Owl Medal",
      description: "Proudly holding golden trophy",
      component: OwlMedal,
      usage: "Leaderboards, awards, rankings",
      category: "Achievements",
    },
    // Navigation
    {
      name: "Owl Welcome",
      description: "Arms wide open with sparkly eyes",
      component: OwlWelcome,
      usage: "Onboarding, first-time users",
      category: "Navigation",
    },
    {
      name: "Owl Bye",
      description: "Waving goodbye with speech bubble",
      component: OwlBye,
      usage: "Logout, session end",
      category: "Navigation",
    },
    // Subjects
    {
      name: "Owl Math",
      description: "Surrounded by math symbols (+, =, ×, π)",
      component: OwlMath,
      usage: "Math subject, calculations",
      category: "Subjects",
    },
    {
      name: "Owl Science",
      description: "Holding beaker with animated bubbles",
      component: OwlScience,
      usage: "Science subject, experiments",
      category: "Subjects",
    },
    {
      name: "Owl English",
      description: "Surrounded by ABC letters with book",
      component: OwlEnglish,
      usage: "English/language subject",
      category: "Subjects",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50 py-12 px-4">
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <MadrassaLogo size="lg" className="justify-center mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Mascot Collection</h1>
          <p className="text-gray-500">Mascot options for the Madrassa Sudan app</p>
        </div>

        {/* Secretary Bird - Sudan's National Bird */}
        <div className="mb-12 bg-gradient-to-r from-green-50 to-amber-50 rounded-3xl p-8 border-2 border-green-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-green-600 to-emerald-700 text-white text-sm font-semibold">
              🇸🇩 Sudan&apos;s National Bird
            </div>
            <div className="h-px flex-1 bg-green-200" />
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="flex flex-col items-center">
              <SecretaryBirdIcon className="w-32 h-32 mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Secretary Bird</h2>
              <p className="text-sm text-gray-600 text-center">طائر الكاتب - The national emblem of Sudan</p>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-sm font-medium text-gray-700 mb-2">Logo Preview:</p>
                <MadrassaBirdLogo size="lg" />
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-sm font-medium text-gray-700 mb-3">Key Features:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Black crest feathers (like quill pens)</li>
                  <li>• Orange face patches around eyes</li>
                  <li>• Long elegant legs</li>
                  <li>• Sudan flag colors (red cap, green body)</li>
                  <li>• Friendly, child-appropriate style</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Owl Grid by Category */}
        {["Core", "Emotions", "Actions", "Feedback", "Achievements", "Navigation", "Subjects"].map((category) => {
          const categoryOwls = owls.filter((owl) => owl.category === category);
          if (categoryOwls.length === 0) return null;

          const categoryColors: Record<string, string> = {
            Core: "from-gray-600 to-gray-800",
            Emotions: "from-pink-500 to-rose-600",
            Actions: "from-blue-500 to-indigo-600",
            Feedback: "from-emerald-500 to-green-600",
            Achievements: "from-amber-500 to-orange-600",
            Navigation: "from-purple-500 to-violet-600",
            Subjects: "from-cyan-500 to-teal-600",
          };

          return (
            <div key={category} className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <div className={`px-4 py-1.5 rounded-full bg-gradient-to-r ${categoryColors[category]} text-white text-sm font-semibold`}>
                  {category}
                </div>
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-sm text-gray-400">{categoryOwls.length} owls</span>
              </div>
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {categoryOwls.map((owl) => (
                  <div
                    key={owl.name}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all"
                  >
                    <div className="flex justify-center mb-3">
                      <owl.component className="w-24 h-24" />
                    </div>
                    <h2 className="text-sm font-semibold text-gray-900 text-center mb-1">
                      {owl.name}
                    </h2>
                    <p className="text-xs text-gray-500 text-center mb-2 line-clamp-2">
                      {owl.description}
                    </p>
                    <div className="bg-gray-50 rounded-lg px-2 py-1.5">
                      <p className="text-[10px] text-gray-400 text-center line-clamp-1">
                        {owl.usage}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Size Variations */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Size Variations</h2>
          <div className="flex items-end justify-center gap-6 flex-wrap">
            <div className="text-center">
              <OwlTutorIcon className="w-8 h-8 mx-auto mb-2" />
              <span className="text-xs text-gray-400">32px</span>
            </div>
            <div className="text-center">
              <OwlTutorIcon className="w-12 h-12 mx-auto mb-2" />
              <span className="text-xs text-gray-400">48px</span>
            </div>
            <div className="text-center">
              <OwlTutorIcon className="w-16 h-16 mx-auto mb-2" />
              <span className="text-xs text-gray-400">64px</span>
            </div>
            <div className="text-center">
              <OwlTutorIcon className="w-24 h-24 mx-auto mb-2" />
              <span className="text-xs text-gray-400">96px</span>
            </div>
            <div className="text-center">
              <OwlTutorIcon className="w-32 h-32 mx-auto mb-2" />
              <span className="text-xs text-gray-400">128px</span>
            </div>
          </div>
        </div>

        {/* Logo Variations */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Logo Variations</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <MadrassaLogo size="sm" />
              <span className="text-sm text-gray-400">Small</span>
            </div>
            <div className="flex items-center gap-4">
              <MadrassaLogo size="md" />
              <span className="text-sm text-gray-400">Medium</span>
            </div>
            <div className="flex items-center gap-4">
              <MadrassaLogo size="lg" />
              <span className="text-sm text-gray-400">Large</span>
            </div>
          </div>
        </div>

        {/* Confetti Demo */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Celebration Effects</h2>
          <div className="flex items-center justify-around flex-wrap gap-6">
            <div className="text-center">
              <ConfettiBurst className="w-24 h-24 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Confetti Burst (SVG)</p>
            </div>
            <div className="text-center">
              <button
                onClick={() => setShowConfetti(true)}
                className="px-6 py-3 bg-gradient-to-r from-[#D21034] via-[#F59E0B] to-[#007229] text-white font-semibold rounded-xl hover:opacity-90 transition-opacity shadow-lg"
              >
                Trigger Full Confetti
              </button>
              <p className="text-sm text-gray-500 mt-2">Click to see full-screen effect</p>
            </div>
          </div>
        </div>

        {/* Color Reference */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sudan Brand Colors</h2>
          <div className="flex gap-4 flex-wrap">
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-[#D21034] shadow-md mb-2" />
              <p className="text-xs font-mono text-gray-500">#D21034</p>
              <p className="text-xs text-gray-400">Red (Body)</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-[#007229] shadow-md mb-2" />
              <p className="text-xs font-mono text-gray-500">#007229</p>
              <p className="text-xs text-gray-400">Green (Cap)</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-[#F59E0B] shadow-md mb-2" />
              <p className="text-xs font-mono text-gray-500">#F59E0B</p>
              <p className="text-xs text-gray-400">Gold (Accents)</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-[#a01028] shadow-md mb-2" />
              <p className="text-xs font-mono text-gray-500">#a01028</p>
              <p className="text-xs text-gray-400">Dark Red (Shadows)</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-white border-2 border-gray-200 shadow-md mb-2" />
              <p className="text-xs font-mono text-gray-500">#FFFFFF</p>
              <p className="text-xs text-gray-400">White (Belly)</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-400">
          <p>All owls are SVG components with CSS animations</p>
          <p>Designed for Sudanese children&apos;s education platform</p>
        </div>
      </div>
    </div>
  );
}

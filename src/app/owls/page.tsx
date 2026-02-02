"use client";

import { useState } from "react";
import {
  OwlTutorIcon,
  OwlWaving,
  OwlCelebrating,
  OwlThinking,
  OwlSad,
  Confetti,
  ConfettiBurst,
  MadrassaLogo,
} from "@/components/illustrations";

export default function OwlShowcasePage() {
  const [showConfetti, setShowConfetti] = useState(false);

  const owls = [
    {
      name: "Owl Tutor",
      description: "The main mascot - wise owl with graduation cap",
      component: OwlTutorIcon,
      usage: "Logo, branding, navigation",
    },
    {
      name: "Owl Waving",
      description: "Friendly greeting pose with animated wing",
      component: OwlWaving,
      usage: "Welcome screens, greetings",
    },
    {
      name: "Owl Celebrating",
      description: "Happy bouncing owl with sparkles",
      component: OwlCelebrating,
      usage: "Achievements, correct answers, completions",
    },
    {
      name: "Owl Thinking",
      description: "Looking up with animated thought bubbles",
      component: OwlThinking,
      usage: "Loading states, AI processing",
    },
    {
      name: "Owl Sad",
      description: "Droopy ears and tilted cap",
      component: OwlSad,
      usage: "Empty states, errors, wrong answers",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50 py-12 px-4">
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <MadrassaLogo size="lg" className="justify-center mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Owl Mascot Collection</h1>
          <p className="text-gray-500">All owl poses used throughout the Madrassa Sudan app</p>
        </div>

        {/* Owl Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
          {owls.map((owl) => (
            <div
              key={owl.name}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-center mb-4">
                <owl.component className="w-32 h-32" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 text-center mb-1">
                {owl.name}
              </h2>
              <p className="text-sm text-gray-500 text-center mb-3">
                {owl.description}
              </p>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400 text-center">
                  <span className="font-medium">Used for:</span> {owl.usage}
                </p>
              </div>
            </div>
          ))}
        </div>

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

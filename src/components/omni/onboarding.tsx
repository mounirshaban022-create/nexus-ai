'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Bot, FileText, Mic, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Onboarding — first-time user experience.
 * 3 quick slides → user lands in chat ready to go.
 */

const SLIDES = [
  {
    icon: Sparkles,
    title: 'Welcome to NEXUS AI',
    titleAr: 'مرحباً بك في NEXUS AI',
    body: 'One AI with every superpower — 507 free models, 30 connectors, and your personal AI workspace.',
    bodyAr: 'ذكاء اصطناعي واحد بكل القدرات — أكثر من 500 نموذج مجاني و30 موصلاً.',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    icon: Mic,
    title: 'Talk, Type, Create',
    titleAr: 'تحدث، اكتب، أنشئ',
    body: 'Chat naturally, speak with voice, create documents, run code, generate images and videos — all in one place.',
    bodyAr: 'دردش، تحدث بصوتك، أنشئ المستندات، شغّل الكود، وأنشئ الصور والفيديو.',
    gradient: 'from-violet-500 to-fuchsia-500',
  },
  {
    icon: Bot,
    title: 'Your AI, Your Rules',
    titleAr: 'ذكاؤك الاصطناعي، قواعدك',
    body: 'Sign in to sync across devices. Choose light or dark, English or Arabic. Built by Mounir Shaaban.',
    bodyAr: 'سجّل الدخول للمزامنة عبر الأجهزة. اختر الوضع الفاتح أو الداكن، الإنجليزية أو العربية.',
    gradient: 'from-emerald-500 to-teal-500',
  },
]

export function OnboardingOverlay({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const slide = SLIDES[step]
  const Icon = slide.icon
  const isLast = step === SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 backdrop-blur-xl" role="dialog" aria-label="Welcome">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-md px-8 text-center"
      >
        {/* Logo animation */}
        <div className={`mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br ${slide.gradient} shadow-2xl`}>
          <Icon className="h-12 w-12 text-white" aria-hidden />
        </div>

        <h1 className="text-3xl font-bold tracking-tight">{slide.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{slide.body}</p>

        {/* Progress dots */}
        <div className="mt-10 flex items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-8 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-center gap-3">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="rounded-full px-6">
              Back
            </Button>
          )}
          <Button
            onClick={() => (isLast ? onComplete() : setStep(step + 1))}
            className="gap-2 rounded-full bg-primary px-8 text-primary-foreground"
          >
            {isLast ? 'Start chatting' : 'Next'}
            {!isLast && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>

        {isLast && (
          <button
            onClick={onComplete}
            className="mt-4 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Skip setup
          </button>
        )}
      </motion.div>

      {/* Footer */}
      <p className="absolute bottom-6 text-xs text-muted-foreground/60">
        NEXUS AI · Created by Mounir Shaaban
      </p>
    </div>
  )
}

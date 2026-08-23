'use client'

import { motion } from 'framer-motion'
import { X } from 'lucide-react'

const PRIVACY = {
  en: {
    title: 'Privacy Policy',
    date: 'Last updated: January 2026',
    sections: [
      { h: '1. Who We Are', p: 'NEXUS AI ("we", "our", "the app") is developed by Mounir Shaaban ("Creator"). This Privacy Policy explains how we collect, use, and protect your information when you use the NEXUS AI application.' },
      { h: '2. Information We Collect', p: 'Account information: your email address and authentication credentials (managed by Supabase Auth). Chat data: your conversations, generated content, and uploaded documents. API keys: third-party AI provider keys you choose to connect (stored encrypted). Usage data: feature interactions and technical logs necessary for the service to function.' },
      { h: '3. How We Use Your Information', p: 'To provide the AI services you request (chat, voice, documents, code, images, video). To authenticate you and sync your data across devices. To improve service quality and diagnose technical issues. We do NOT sell your personal data to third parties.' },
      { h: '4. AI Providers', p: 'Your AI requests may be processed by third-party providers including Puter, OpenRouter, DeepSeek, Zhipu, Google, and others. Your prompts are sent to these providers to generate responses. Do not share sensitive personal information (financial details, passwords, medical records) in your prompts.' },
      { h: '5. Data Storage & Security', p: 'Your data is stored in Supabase (PostgreSQL) with Row-Level Security — only you can access your own data. Connected API keys are encrypted using AES-256-GCM before storage. All transmissions use TLS/SSL encryption.' },
      { h: '6. Your Rights (GDPR/CCPA)', p: 'You have the right to: access your personal data, export your data, delete your account and all associated data, correct inaccurate information, and object to processing. To exercise these rights, contact the Creator or use the in-app account deletion option.' },
      { h: '7. Data Retention', p: 'Your chat history and generated content are retained until you delete them or your account. Account deletion permanently removes all associated data within 30 days.' },
      { h: '8. Children\'s Privacy', p: 'NEXUS AI is not intended for children under 13 (or 16 in the EU). We do not knowingly collect data from children.' },
      { h: '9. Changes to This Policy', p: 'We may update this Privacy Policy from time to time. Material changes will be communicated through the app. Continued use constitutes acceptance of the updated policy.' },
      { h: '10. Contact', p: 'For privacy questions or requests, contact Mounir Shaaban, Creator of NEXUS AI.' },
    ],
  },
  ar: {
    title: 'سياسة الخصوصية',
    date: 'آخر تحديث: يناير 2026',
    sections: [
      { h: '١. من نحن', p: 'تطبيق NEXUS AI تم تطويره بواسطة مونير شعبان ("المطوّر"). توضح سياسة الخصوصية هذه كيف نجمع معلوماتك ونستخدمها ونحميها عند استخدامك للتطبيق.' },
      { h: '٢. المعلومات التي نجمعها', p: 'معلومات الحساب: بريدك الإلكتروني وبيانات المصادقة (تُدار بواسطة Supabase). بيانات المحادثة: محادثاتك والمحتوى المُنشأ والمستندات المرفوعة. مفاتيح API: مفاتيح مزودي الذكاء الاصطناعي التي تختار ربطها (مشفرة).' },
      { h: '٣. كيف نستخدم معلوماتك', p: 'لتقديم خدمات الذكاء الاصطناعي التي تطلبها. للمصادقة ومزامنة بياناتك عبر الأجهزة. لتحسين جودة الخدمة. نحن لا نبيع بياناتك الشخصية لأي طرف ثالث.' },
      { h: '٤. مزودو الذكاء الاصطناعي', p: 'قد تتم معالجة طلباتك بواسطة مزودين خارجيين. لا تشارك معلومات حساسة في محادثاتك.' },
      { h: '٥. تخزين البيانات والأمان', p: 'تُخزن بياناتك في Supabase مع أمان على مستوى الصفوف — أنت الوحيد الذي يمكنه الوصول إلى بياناتك. مفاتيح API مشفرة باستخدام AES-256.' },
      { h: '٦. حقوقك', p: 'لديك الحق في: الوصول إلى بياناتك، تصديرها، حذف حسابك وجميع بياناتك، تصحيح المعلومات غير الدقيقة.' },
      { h: '٧. الاحتفاظ بالبيانات', p: 'تُحتفظ ببياناتك حتى تحذفها أو تحذف حسابك. حذف الحساب يزيل جميع البيانات نهائياً خلال ٣٠ يوماً.' },
      { h: '٨. خصوصية الأطفال', p: 'التطبيق غير مخصص للأطفال دون ١٣ عاماً.' },
      { h: '٩. التغييرات', p: 'قد نحدّث هذه السياسة من وقت لآخر. الاستمرار في الاستخدام يعني قبول السياسة المحدّثة.' },
      { h: '١٠. التواصل', p: 'للاستفسارات المتعلقة بالخصوصية، تواصل مع مونير شعبان، مطوّر التطبيق.' },
    ],
  },
}

const TERMS = {
  en: {
    title: 'Terms of Service',
    date: 'Last updated: January 2026',
    sections: [
      { h: '1. Acceptance', p: 'By accessing or using NEXUS AI, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.' },
      { h: '2. Description of Service', p: 'NEXUS AI provides AI-powered tools including chat, voice interaction, document analysis, code execution, image generation, and video generation. The service is provided by Mounir Shaaban ("Creator", "we", "us").' },
      { h: '3. Eligibility', p: 'You must be at least 13 years old to use this service. By using NEXUS AI, you represent that you meet this requirement.' },
      { h: '4. Acceptable Use', p: 'You agree NOT to: use the service for illegal purposes; generate content that infringes intellectual property rights; create harmful, abusive, or deceptive content; attempt to overload, hack, or disrupt the service; resell access without written permission; use the service to violate any applicable laws.' },
      { h: '5. AI-Generated Content', p: 'Content generated by AI may be inaccurate, biased, or incomplete. You are responsible for reviewing and verifying AI outputs before relying on them. The Creator is not liable for actions taken based on AI-generated content.' },
      { h: '6. Your Content', p: 'You retain ownership of content you create and upload. By using the service, you grant us a limited license to process your content solely to provide the service to you.' },
      { h: '7. Third-Party Services', p: 'NEXUS AI integrates with third-party AI providers and APIs. Their terms and policies also apply. We are not responsible for third-party service availability, accuracy, or practices.' },
      { h: '8. Limitation of Liability', p: 'The service is provided "AS IS" without warranties of any kind. To the maximum extent permitted by law, the Creator shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.' },
      { h: '9. Termination', p: 'We may suspend or terminate your access for violations of these Terms. You may stop using the service and delete your account at any time.' },
      { h: '10. Subscription & Payment', p: 'If you purchase a subscription, fees are charged on a recurring basis until cancelled. Refunds are handled per applicable consumer protection laws. Prices may change with notice.' },
      { h: '11. Governing Law', p: 'These Terms are governed by the laws of the United Arab Emirates. Disputes shall be resolved in the courts of Dubai, UAE.' },
      { h: '12. Contact', p: 'For questions about these Terms, contact Mounir Shaaban, Creator of NEXUS AI.' },
    ],
  },
  ar: {
    title: 'شروط الاستخدام',
    date: 'آخر تحديث: يناير 2026',
    sections: [
      { h: '١. القبول', p: 'باستخدامك تطبيق NEXUS AI، فإنك توافق على شروط الاستخدام هذه. إذا لم توافق، لا تستخدم الخدمة.' },
      { h: '٢. وصف الخدمة', p: 'يوفر التطبيق أدوات ذكاء اصطناعي تشمل المحادثة والتفاعل الصوتي وتحليل المستندات وتنفيذ الكود وإنشاء الصور والفيديو. الخدمة مقدمة من مونير شعبان.' },
      { h: '٣. الأهلية', p: 'يجب أن يكون عمرك ١٣ عاماً على الأقل لاستخدام الخدمة.' },
      { h: '٤. الاستخدام المقبول', p: 'توافق على عدم: استخدام الخدمة لأغراض غير قانونية؛ إنشاء محتوى ينتهك حقوق الملكية الفكرية؛ إنشاء محتوى ضار أو مسيء؛ محاولة اختراق الخدمة؛ إعادة بيع الوصول دون إذن.' },
      { h: '٥. المحتوى المُنشأ بالذكاء الاصطناعي', p: 'قد يكون المحتوى المُنشأ غير دقيق أو متحيز. أنت مسؤول عن مراجعة المخرجات قبل الاعتماد عليها. المطوّر غير مسؤول عن الإجراءات المتخذة بناءً على محتوى الذكاء الاصطناعي.' },
      { h: '٦. محتواك', p: 'تحتفظ بملكية المحتوى الذي تنشئه. بمنحنا ترخيصاً محدوداً لمعالجة محتواك لتقديم الخدمة لك فقط.' },
      { h: '٧. خدمات الطرف الثالث', p: 'يتكامل التطبيق مع مزودي ذكاء اصطناعي خارجيين. تنطبق شروطهم وسياساتهم أيضاً.' },
      { h: '٨. حدود المسؤولية', p: 'الخدمة مقدمة "كما هي" دون ضمانات. بأقصى حد يسمح به القانون، المطوّر غير مسؤول عن أي أضرار غير مباشرة ناتجة عن استخدامك للخدمة.' },
      { h: '٩. الإنهاء', p: 'قد نوقف أو ننهي وصولك لانتهاك هذه الشروط. يمكنك إيقاف استخدام الخدمة وحذف حسابك في أي وقت.' },
      { h: '١٠. الاشتراك والدفع', p: 'إذا اشتريت اشتراكاً، تُحصّل الرسوم على أساس متكرر حتى الإلغاء. تتم معالجة المبالغ المستردة وفقاً لقوانين حماية المستهلك.' },
      { h: '١١. القانون الحاكم', p: 'تحكم هذه الشروط قوانين دولة الإمارات العربية المتحدة. تُحل النزاعات في محاكم دبي.' },
      { h: '١٢. التواصل', p: 'للاستفسارات، تواصل مع مونير شعبان، مطوّر التطبيق.' },
    ],
  },
}

export function LegalPage({ type, onClose, language }: {
  type: 'privacy' | 'terms'
  onClose: () => void
  language: 'en' | 'ar'
}) {
  const content = type === 'privacy' ? PRIVACY[language] : TERMS[language]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-label={content.title}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex h-[90dvh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-background"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-lg font-bold">{content.title}</h3>
            <p className="text-xs text-muted-foreground">{content.date}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="omni-scroll flex-1 overflow-y-auto px-5 py-4">
          {content.sections.map((s, i) => (
            <section key={i} className="mb-5">
              <h4 className="text-sm font-semibold text-foreground">{s.h}</h4>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.p}</p>
            </section>
          ))}
          <p className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
            NEXUS AI · {type === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} · © 2026 Mounir Shaaban
          </p>
        </div>
      </motion.div>
    </div>
  )
}

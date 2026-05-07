import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import Features from '@/components/Features'
import HowItWorks from '@/components/HowItWorks'
import Providers from '@/components/Providers'
import Memory from '@/components/Memory'
import Integrations from '@/components/Integrations'
import Install from '@/components/Install'
import Footer from '@/components/Footer'

export default function HomePage() {
  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: 'var(--page-bg)', color: 'var(--fg)' }}
    >
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Providers />
        <Memory />
        <Integrations />
        <Install />
      </main>
      <Footer />
    </div>
  )
}

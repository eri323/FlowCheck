import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MarketingNav } from "./_components/landing/marketing-nav";
import { Hero } from "./_components/landing/hero";
import { HowItWorks } from "./_components/landing/how-it-works";
import { TestTypes } from "./_components/landing/test-types";
import { Features } from "./_components/landing/features";
import { CtaSection } from "./_components/landing/cta-section";
import { MarketingFooter } from "./_components/landing/marketing-footer";

export default async function Home(): Promise<React.JSX.Element> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authed = Boolean(user);

  return (
    <>
      <MarketingNav authed={authed} />
      <main className="flex-1">
        <Hero authed={authed} />
        <HowItWorks />
        <TestTypes />
        <Features />
        <CtaSection authed={authed} />
      </main>
      <MarketingFooter />
    </>
  );
}

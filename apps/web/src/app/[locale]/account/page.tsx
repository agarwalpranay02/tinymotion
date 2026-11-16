import { getTranslations, setRequestLocale } from "next-intl/server";
import { Dashboard, SignInPanel } from "@/components/Account";
import { PageHeader } from "@/components/PageHeader";
import { authProviders } from "@/lib/server/auth";
import { devLoginEnabled } from "@/lib/server/env";
import { getSession } from "@/lib/server/session";

export const metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account");
  const session = await getSession();
  return (
    <>
      <PageHeader title={session ? t("title") : t("signInTitle")} sub={session ? undefined : t("signInSub")} />
      <div className="wrap">
        {session ? (
          <Dashboard name={session.user.name} email={session.user.email} />
        ) : (
          <SignInPanel google={authProviders.google} email={authProviders.email} dev={devLoginEnabled} />
        )}
      </div>
    </>
  );
}

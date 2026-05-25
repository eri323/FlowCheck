import Link from "next/link";
import { ArrowLeft } from "@/components/ui/icons";
import { PageHeader } from "../../_components/page-header";
import { NewTestRunForm } from "./_components/new-test-run-form";

export const metadata = { title: "Nuevo test run" };

export default function NewRunPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/runs"
        className="text-muted hover:text-text inline-flex w-fit items-center gap-1.5 text-sm transition-colors duration-150"
      >
        <ArrowLeft size={15} />
        Test runs
      </Link>
      <PageHeader
        title="Nuevo test run"
        description="Describe el flujo en lenguaje natural y la IA generará la prueba."
      />
      <NewTestRunForm />
    </div>
  );
}

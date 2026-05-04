import { Layout } from "@/components/layout";
import { RulebookContent } from "@/components/rulebook-content";

export default function RulesPage() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-2rem)] md:h-screen flex flex-col">
        <RulebookContent variant="page" syncHash />
      </div>
    </Layout>
  );
}

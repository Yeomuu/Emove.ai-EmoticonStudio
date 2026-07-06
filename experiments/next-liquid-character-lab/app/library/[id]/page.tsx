import { LibraryDetailLab } from "../../../components/EmoveFeatureLab";

export default async function LibraryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <LibraryDetailLab itemId={id} />;
}

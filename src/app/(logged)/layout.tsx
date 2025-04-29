import LayoutSidebar from '@/components/layout-sidebar';

export default function ExplorerLayout({ children }: { children: React.ReactNode }) {
  return <LayoutSidebar>{children}</LayoutSidebar>;
}

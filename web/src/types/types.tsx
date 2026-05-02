export interface NavItem {
  label: string;
  href: string;
}
 
export interface StatItem {
  value: string;
  label: string;
}
 
export interface FeatureCard {
  icon: string;
  title: string;
  description: string;
}
 
export interface Step {
  number: number;
  icon: string;
  title: string;
  description: string;
}
 
export interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}
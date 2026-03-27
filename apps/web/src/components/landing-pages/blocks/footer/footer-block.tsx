'use client';

import { Twitter, Facebook, Instagram, Linkedin, Youtube, Github } from 'lucide-react';
import type { FooterContent } from '@1person/workflow/landing-pages/blocks';

const socialIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  twitter: Twitter,
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  youtube: Youtube,
  github: Github,
};

interface FooterBlockProps {
  content: FooterContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
}

export function FooterBlock({
  content,
  primaryColor,
  isEditing,
  onFieldClick,
}: FooterBlockProps) {
  const handleFieldClick = (path: string[]) => (e: React.MouseEvent) => {
    if (isEditing && onFieldClick) {
      e.preventDefault();
      e.stopPropagation();
      onFieldClick(path);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-12 px-4 bg-gray-900 text-white">
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div className="md:col-span-1">
            {content.logo ? (
              <img src={content.logo} alt={content.companyName} className="h-8 mb-4" />
            ) : (
              <h3
                className={`text-xl font-bold mb-4 ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-text' : ''}`}
                onClick={handleFieldClick(['companyName'])}
              >
                {content.companyName || 'Company'}
              </h3>
            )}
            {content.tagline && (
              <p
                className={`text-gray-400 text-sm ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-text' : ''}`}
                onClick={handleFieldClick(['tagline'])}
              >
                {content.tagline}
              </p>
            )}
            {/* Social Links */}
            {content.socialLinks && content.socialLinks.length > 0 && (
              <div className="flex gap-3 mt-4">
                {content.socialLinks.map((social, i) => {
                  const Icon = socialIcons[social.platform];
                  if (!Icon) return null;
                  return (
                    <a
                      key={i}
                      href={isEditing ? '#' : social.url}
                      className="text-gray-400 hover:text-white transition-colors"
                      onClick={isEditing ? handleFieldClick(['socialLinks', String(i)]) : undefined}
                    >
                      <Icon className="w-5 h-5" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Link Groups */}
          {content.linkGroups?.map((group, i) => (
            <div
              key={i}
              className={isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-4 cursor-pointer' : ''}
              onClick={handleFieldClick(['linkGroups', String(i)])}
            >
              <h4 className="font-semibold mb-4">{group.title}</h4>
              <ul className="space-y-2">
                {group.links.map((link, j) => (
                  <li key={j}>
                    <a
                      href={isEditing ? '#' : link.url}
                      className="text-gray-400 hover:text-white text-sm transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Copyright */}
        <div className="border-t border-gray-800 pt-8 text-center">
          <p
            className={`text-gray-400 text-sm ${isEditing ? 'hover:outline hover:outline-2 hover:outline-blue-400 hover:outline-offset-2 cursor-text' : ''}`}
            onClick={handleFieldClick(['copyright'])}
          >
            {content.copyright || `© ${currentYear} ${content.companyName || 'Company'}. All rights reserved.`}
          </p>
        </div>
      </div>
    </footer>
  );
}

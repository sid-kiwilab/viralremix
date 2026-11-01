import Link from "next/link";
import Image from "next/image";
import { SiteShell } from "@/components/site-shell";
import { CHARACTERS } from "@/lib/characters";

export default function AvatarsPage() {
  return (
    <SiteShell isLanding={false}>
      <Link href="/" className="btn btn-ghost page-back">
        Back
      </Link>
      <article className="how-it-works avatars-page">
        <h1 className="content-h1">
          Our <em>Avatars</em>
        </h1>
        <p className="content-lede">
          The face every remix will share.
        </p>

        <ul className="avatar-roster">
          {CHARACTERS.map((character) => (
            <li key={character.id}>
              <section className="avatar-card" aria-labelledby={`avatar-${character.id}`}>
                <div className="avatar-spotlight">
                  <div className="avatar-spotlight-photo">
                    <Image
                      src={character.profileSrc}
                      alt={`${character.name}, ${character.role.toLowerCase()}`}
                      width={480}
                      height={640}
                      sizes="(max-width: 720px) 72vw, 220px"
                      className="avatar-spotlight-img"
                      priority
                    />
                  </div>
                  <div className="avatar-spotlight-copy">
                    <span className="avatar-card-tag">{character.role}</span>
                    <h2 id={`avatar-${character.id}`}>{character.name}</h2>
                    <p>{character.consentLine}</p>
                    <p className="avatar-spotlight-note">{character.statusLine}</p>
                  </div>
                </div>
              </section>
            </li>
          ))}
        </ul>
      </article>
    </SiteShell>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { getTechLogos } from "@/lib/utils";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { TechIconProps } from "@/types";

const DisplayTechIcons = ({ techStack }: TechIconProps) => {
    const [techIcons, setTechIcons] = useState<
        { tech: string; url: string }[]
    >([]);

    useEffect(() => {
        const loadIcons = async () => {
            const icons = await getTechLogos(techStack ?? []);
            setTechIcons(icons);
        };

        loadIcons();
    }, [techStack]);

    return (
        <div className="flex flex-row">
            {techIcons.slice(0, 3).map(({ tech, url }, index) => (
                <div
                    key={`${tech}-${index}`}
                    className={cn(
                        "relative group bg-dark-300 rounded-full p-2 flex-center",
                        index >= 1 && "-ml-3"
                    )}
                >
                    <span className="tech-tooltip">{tech}</span>
                    <Image
                        src={url}
                        alt={tech}
                        width={100}
                        height={100}
                        className="size-5"
                    />
                </div>
            ))}
        </div>
    );
};

export default DisplayTechIcons;

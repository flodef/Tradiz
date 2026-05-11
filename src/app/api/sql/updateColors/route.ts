import { NextResponse } from 'next/server';
import { getMainDb } from '../db';

interface Color {
    label: string;
    light: string;
    dark: string;
}

interface UpdateColorsRequest {
    colors: Color[];
    themeName: string;
    selectedThemeIndex: number;
    customThemeNames: Record<number, string>;
}

export async function POST(request: Request) {
    try {
        const { colors, themeName, selectedThemeIndex, customThemeNames } =
            (await request.json()) as UpdateColorsRequest;

        if (!Array.isArray(colors) || colors.length === 0) {
            return NextResponse.json({ error: 'Invalid colors data' }, { status: 400 });
        }

        const connection = await getMainDb();

        // Group colors by theme (every 7 colors is one theme)
        const themes: Color[][] = [];
        for (let i = 0; i < colors.length; i += 7) {
            themes.push(colors.slice(i, i + 7));
        }

        // Delete all existing themes and re-insert
        // First, unselect all themes
        const unselectQuery = connection.isPostgreSQL
            ? "UPDATE theme_admin SET selected = false"
            : "UPDATE theme_admin SET selected = 0";
        await connection.execute(unselectQuery);

        // Insert/update all themes
        for (let themeIndex = 0; themeIndex < themes.length; themeIndex++) {
            const theme = themes[themeIndex];
            const name = themeIndex === 0 ? themeName || 'Défaut' : customThemeNames[themeIndex] || `Thème ${themeIndex + 1}`;
            const isSelected = themeIndex === selectedThemeIndex;

            // Find color values by label
            const getColor = (label: string) => {
                const color = theme.find((c) => c.label === label);
                return color || { light: '#000000', dark: '#FFFFFF' };
            };

            const text = getColor('Texte');
            const gradientStart = getColor('Fond début dégradé');
            const gradientEnd = getColor('Fond fin dégradé');
            const popup = getColor('Popup');
            const activated = getColor('Activé');
            const secondary = getColor('Secondaire');
            const secondaryActivated = getColor('Secondaire activé');

            if (connection.isPostgreSQL) {
                // Check if theme exists by name
                const [existing] = await connection.execute(
                    'SELECT id FROM theme_admin WHERE name = $1',
                    [name]
                );

                if (Array.isArray(existing) && existing.length > 0) {
                    // Update existing theme
                    const updateQuery = `
                        UPDATE theme_admin SET
                            text_light = $1,
                            text_dark = $2,
                            gradient_start_light = $3,
                            gradient_start_dark = $4,
                            gradient_end_light = $5,
                            gradient_end_dark = $6,
                            popup_light = $7,
                            popup_dark = $8,
                            activated_light = $9,
                            activated_dark = $10,
                            secondary_light = $11,
                            secondary_dark = $12,
                            secondary_activated_light = $13,
                            secondary_activated_dark = $14,
                            selected = $15
                        WHERE name = $16
                    `;
                    await connection.execute(updateQuery, [
                        text.light,
                        text.dark,
                        gradientStart.light,
                        gradientStart.dark,
                        gradientEnd.light,
                        gradientEnd.dark,
                        popup.light,
                        popup.dark,
                        activated.light,
                        activated.dark,
                        secondary.light,
                        secondary.dark,
                        secondaryActivated.light,
                        secondaryActivated.dark,
                        isSelected,
                        name,
                    ]);
                } else {
                    // Insert new theme
                    const insertQuery = `
                        INSERT INTO theme_admin (
                            name, text_light, text_dark, gradient_start_light, gradient_start_dark,
                            gradient_end_light, gradient_end_dark, popup_light, popup_dark,
                            activated_light, activated_dark, secondary_light, secondary_dark,
                            secondary_activated_light, secondary_activated_dark, selected
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    `;
                    await connection.execute(insertQuery, [
                        name,
                        text.light,
                        text.dark,
                        gradientStart.light,
                        gradientStart.dark,
                        gradientEnd.light,
                        gradientEnd.dark,
                        popup.light,
                        popup.dark,
                        activated.light,
                        activated.dark,
                        secondary.light,
                        secondary.dark,
                        secondaryActivated.light,
                        secondaryActivated.dark,
                        isSelected,
                    ]);
                }
            } else {
                // MariaDB
                const [existing] = await connection.execute(
                    'SELECT id FROM theme_admin WHERE name = ?',
                    [name]
                );

                if (Array.isArray(existing) && existing.length > 0) {
                    // Update existing theme
                    const updateQuery = `
                        UPDATE theme_admin SET
                            text_light = ?,
                            text_dark = ?,
                            gradient_start_light = ?,
                            gradient_start_dark = ?,
                            gradient_end_light = ?,
                            gradient_end_dark = ?,
                            popup_light = ?,
                            popup_dark = ?,
                            activated_light = ?,
                            activated_dark = ?,
                            secondary_light = ?,
                            secondary_dark = ?,
                            secondary_activated_light = ?,
                            secondary_activated_dark = ?,
                            selected = ?
                        WHERE name = ?
                    `;
                    await connection.execute(updateQuery, [
                        text.light,
                        text.dark,
                        gradientStart.light,
                        gradientStart.dark,
                        gradientEnd.light,
                        gradientEnd.dark,
                        popup.light,
                        popup.dark,
                        activated.light,
                        activated.dark,
                        secondary.light,
                        secondary.dark,
                        secondaryActivated.light,
                        secondaryActivated.dark,
                        isSelected ? 1 : 0,
                        name,
                    ]);
                } else {
                    // Insert new theme
                    const insertQuery = `
                        INSERT INTO theme_admin (
                            name, text_light, text_dark, gradient_start_light, gradient_start_dark,
                            gradient_end_light, gradient_end_dark, popup_light, popup_dark,
                            activated_light, activated_dark, secondary_light, secondary_dark,
                            secondary_activated_light, secondary_activated_dark, selected
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    await connection.execute(insertQuery, [
                        name,
                        text.light,
                        text.dark,
                        gradientStart.light,
                        gradientStart.dark,
                        gradientEnd.light,
                        gradientEnd.dark,
                        popup.light,
                        popup.dark,
                        activated.light,
                        activated.dark,
                        secondary.light,
                        secondary.dark,
                        secondaryActivated.light,
                        secondaryActivated.dark,
                        isSelected ? 1 : 0,
                    ]);
                }
            }
        }

        // Delete any themes that are no longer in the list
        // Get all theme names to keep
        const themeNamesToKeep: string[] = [];
        for (let i = 0; i < themes.length; i++) {
            const name = i === 0 ? themeName || 'Défaut' : customThemeNames[i] || `Thème ${i + 1}`;
            themeNamesToKeep.push(name);
        }

        if (themeNamesToKeep.length > 0) {
            if (connection.isPostgreSQL) {
                const deleteQuery = `DELETE FROM theme_admin WHERE name NOT IN (${themeNamesToKeep.map((_, i) => `$${i + 1}`).join(', ')})`;
                await connection.execute(deleteQuery, themeNamesToKeep);
            } else {
                const deleteQuery = `DELETE FROM theme_admin WHERE name NOT IN (${themeNamesToKeep.map(() => '?').join(', ')})`;
                await connection.execute(deleteQuery, themeNamesToKeep);
            }
        }

        await connection.end();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error updating colors:', error);
        return NextResponse.json(
            { error: 'An error occurred while updating colors' },
            { status: 500 }
        );
    }
}

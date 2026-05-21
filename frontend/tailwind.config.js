/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: '0px',
  			md: '0px',
  			sm: '0px'
  		},
  		colors: {
  			brand: {
  				DEFAULT: '#646E5A',
  				dark:    '#2F3C1E',
  				light:   '#8A9478',
  				muted:   '#4A5240',
  			},
  			'herko-primary': '#2D5016',
  			'herko-primary-hover': '#1F3810',
  			'herko-accent': '#7CBA00',
  			'herko-bg': '#FFFFFF',
  			'herko-bg-light': '#F3F3F3',
  			'herko-bg-lightest': '#F9F9F9',
  			'herko-bg-selection': '#E8F4E8',
  			'herko-text': '#3C3C3C',
  			'herko-text-secondary': '#666666',
  			'herko-text-muted': '#999999',
  			'herko-border': '#E5E5E5',
  			'herko-border-input': '#CCCCCC',
  			'herko-edit': '#997755',
  			'herko-app': '#FF8C00',
  			'herko-rc': '#0078D4',
  			'herko-rel': '#7CBA00',
  			'herko-dep': '#D13438',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
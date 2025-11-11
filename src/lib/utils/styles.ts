import { cva } from "class-variance-authority";

export const components = {
    button: cva("flex flex-nowrap items-center justify-center gap-2 w-fit rounded px-2 py-1 no-underline transition", {
        variants: {
            type: {
                primary: "bg-white dark:bg-zinc-800 text-black dark:text-white border border-primary hover:bg-secondary not-hover:shadow-[0_1px_0_rgba(0,0,0,0.1)] hover:cursor-pointer",
                negative: "bg-brand-1 text-white border border-red-600 hover:bg-red-700 hover:border-red-700",
                positive: "bg-green-600 text-white border border-green-600 hover:bg-green-700 hover:border-green-700"
            },
            size: {
                xs: "text-xs",
                sm: "text-sm",
                md: "text-md",
                lg: "text-lg",
            },
        },
        defaultVariants: {
            type: "primary",
            size: "sm",
        }
    }),
    input: cva("flex flex-nowrap w-fit rounded px-2 py-1 transition", {
        variants: {
            type: {
                primary: "bg-white dark:bg-zinc-800 text-black dark:text-white placeholder:text-secondary border border-primary hover:bg-secondary not-hover:shadow-[0_1px_0_rgba(0,0,0,0.1)]",
            },
            size: {
                xs: "text-xs",
                sm: "text-sm",
                md: "text-md",
                lg: "text-lg",
            },
        },
        defaultVariants: {
            type: "primary",
            size: "sm",
        }
    }),
    badge: cva("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm font-medium border border-transparent", {
        variants: {
            color: {
                default: "bg-white text-black dark:text-white border-primary",
                green: "bg-green-300 text-green-800",
                emerald: "bg-emerald-300 text-emerald-800",
                red: "bg-red-200 text-red-800",
                dark_red: "bg-red-600 text-secondary",
                blue: "bg-blue-300 text-blue-800",
                cyan: "bg-cyan-300 text-cyan-800",
                yellow: "bg-yellow-300 text-yellow-800",
                gray: "bg-gray-300 text-gray-500 dark:bg-zinc-600 dark:text-zinc-300",
            }
        }
    })

};

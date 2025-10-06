import { cva } from "class-variance-authority";

export const components = {
    button: cva("flex flex-nowrap items-center justify-center gap-2 w-fit rounded px-2 py-1 no-underline", {
        variants: {
            type: {
                primary: "bg-white text-black border border-gray-300 hover:border-gray-400",
                negative: "bg-red-600 text-white border border-red-600 hover:bg-red-700 hover:border-red-700",
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
    input: cva("flex flex-nowrap w-fit rounded px-2 py-1", {
        variants: {
            type: {
                primary: "bg-white text-black border border-gray-300 hover:border-gray-400",
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
                default: "bg-white text-black border-gray-300",
                green: "bg-green-300 text-green-800",
                red: "bg-red-200 text-red-800",
                emerald: "bg-emerald-300 text-emerald-800",
                blue: "bg-blue-300 text-blue-800",
            }
        }
    })

};

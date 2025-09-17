import { cva } from "class-variance-authority";

export const components = {
    button: cva("flex flex-nowrap items-center justify-center gap-1.5 w-fit rounded px-1.5 py-0.5", {
        variants: {
            type: {
                primary: "bg-white text-black border border-gray-300 hover:bg-gray-300",
                negative: "bg-red-600 text-white border border-red-600 hover:bg-red-600 hover:border-red-600",
                positive: "bg-green-600 text-white border border-green-600 hover:bg-green-600 hover:border-green-600"
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
    input: cva("flex flex-nowrap w-fit rounded px-1.5 py-0.5", {
        variants: {
            type: {
                primary: "bg-white text-black border border-gray-300",
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
    })
};

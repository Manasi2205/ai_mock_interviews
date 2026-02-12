"use client";

import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import FormField from "@/components/FormField";
import { useRouter } from "next/navigation";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/firebase/client";
import { signUp, signIn } from "@/lib/actions/auth.action";
import type { FormType } from "@/types";

const getAuthFormSchema = (type: FormType) => {
    return z.object({
        name:
            type === "sign-up"
                ? z.string().min(3, "Name must be at least 3 characters")
                : z.string().optional(),
        email: z.string().email("Invalid email address"),
        password: z.string().min(6, "Password must be at least 6 characters"),
    });
};

const AuthForm = ({ type }: { type: FormType }) => {
    const router = useRouter();
    const formSchema = getAuthFormSchema(type);
    const isSignIn = type === "sign-in";

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            if (!isSignIn) {
                // SIGN UP
                const { name, email, password } = values;

                const userCredentials = await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );

                const result = await signUp({
                    uid: userCredentials.user.uid,
                    name: name!,
                    email,
                    password,
                });

                if (!result?.success) {
                    toast.error(result?.message);
                    return;
                }

                toast.success("Account created successfully. Please sign in.");
                router.push("/sign-in");
            } else {
                // SIGN IN
                const { email, password } = values;

                const userCredential = await signInWithEmailAndPassword(
                    auth,
                    email,
                    password
                );

                const idToken = await userCredential.user.getIdToken();

                if (!idToken) {
                    toast.error("Sign in failed");
                    return;
                }

                await signIn({ email, idToken });

                toast.success("Sign in successful 🎉");
                router.push("/");
            }
        } catch (error: any) {
            console.error(error);

            // 🔥 Firebase error handling
            if (error.code === "auth/email-already-in-use") {
                toast.error(
                    "This email is already registered. Redirecting to sign in..."
                );
                router.push("/sign-in");
                return;
            }

            if (error.code === "auth/invalid-email") {
                toast.error("Invalid email address.");
                return;
            }

            if (error.code === "auth/user-not-found") {
                toast.error("No account found with this email.");
                return;
            }

            if (error.code === "auth/wrong-password") {
                toast.error("Incorrect password.");
                return;
            }

            if (error.code === "auth/weak-password") {
                toast.error("Password must be at least 6 characters.");
                return;
            }

            toast.error("Something went wrong. Please try again.");
        }
    }

    return (
        <div className="card-border lg:min-w-[566px]">
            <div className="flex flex-col gap-6 card py-14 px-10">
                <div className="flex flex-row gap-2 justify-center items-center">
                    <Image src="/logo.svg" alt="logo" height={32} width={38} />
                    <h2 className="text-primary-100">PrepWise</h2>
                </div>

                <h3>Practice job interviews with AI</h3>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="w-full space-y-6 mt-4 form"
                    >
                        {/* Always render Name field to keep hydration stable */}
                        <div className={isSignIn ? "hidden" : ""}>
                            <FormField
                                control={form.control}
                                name="name"
                                label="Name"
                                placeholder="Your Name"
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="email"
                            label="Email"
                            placeholder="Your email address"
                            type="email"
                        />

                        <FormField
                            control={form.control}
                            name="password"
                            label="Password"
                            placeholder="Enter your Password"
                            type="password"
                        />

                        <Button className="btn w-full" type="submit">
                            {isSignIn ? "Sign In" : "Create an Account"}
                        </Button>
                    </form>
                </Form>

                <p className="text-center">
                    {isSignIn
                        ? "No account yet?"
                        : "Already have an account?"}

                    <Link
                        href={isSignIn ? "/sign-up" : "/sign-in"}
                        className="font-bold text-user-primary ml-1"
                    >
                        {isSignIn ? "Sign up" : "Sign in"}
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default AuthForm;

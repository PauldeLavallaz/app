import { Link } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";
import { toast } from "sonner";
import { z } from "zod";
import { hasBusinessPlan, useCurrentPlan } from "@/hooks/use-current-plan";
import { useUserSettings } from "@/hooks/use-user-settings";
import { cn } from "@/lib/utils";
import { InlineAutoForm } from "./auto-form/auto-form-dialog";
import { DependencyType } from "./auto-form/types";
import { Skeleton } from "./ui/skeleton";
import { updateUser } from "./user-api";

export function UserSettings() {
  const sub = useCurrentPlan();
  const requiresBusinessPlan = !hasBusinessPlan(sub?.plans?.plans);
  const DEFAULT_MAX_SPEND_LIMIT = hasBusinessPlan(sub?.plans?.plans) ? 1000 : 5;
  const { data: userSettings } = useUserSettings();

  // const enableStorage = userSettings?.enable_custom_output_bucket;

  const { check, isLoading: isCustomerLoading } = useCustomer();
  const customS3CheckResult = check({ featureId: "custom_s3" });
  const enableStorage = customS3CheckResult.data.allowed;

  if (isCustomerLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-6" />
        <Skeleton className="h-5 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("mx-auto w-full max-w-lg py-10")}>
      {requiresBusinessPlan && (
        <div className="mb-4 border-yellow-400 border-l-4 bg-yellow-50 p-4 dark:border-yellow-500 dark:bg-yellow-900/50">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                Settings are locked until your workspace has an active Business
                plan.
              </p>
            </div>
          </div>
        </div>
      )}
      <InlineAutoForm
        className={cn(
          "w-full",
          requiresBusinessPlan && "disabled pointer-events-none opacity-50",
        )}
        buttonTitle="Save"
        formSchema={z.object({
          output_visibility: z
            .enum(["public", "private"])
            .default("public")
            .describe("Output Visibility"),
          custom_output_bucket: z
            .boolean()
            .default(false)
            .optional()
            .describe("Enable Custom Output Bucket"),
          s3_access_key_id: z
            .string()
            .optional()
            .describe("S3 Access Key ID")
            .nullable(),
          s3_secret_access_key: z
            .string()
            .optional()
            .describe("S3 Secret Access Key")
            .nullable(),
          s3_bucket_name: z
            .string()
            .optional()
            .describe("S3 Bucket Name")
            .nullable(),
          s3_region: z.string().optional().describe("S3 Region").nullable(),
          assumed_role_arn: z
            .string()
            .optional()
            .describe("AWS Role to Assume (ARN)")
            .nullable(),
          use_cloudfront: z
            .boolean()
            .default(false)
            .optional()
            .describe("CloudFront (CDN)"),
          cloudfront_domain: z
            .string()
            .optional()
            .describe("CloudFront Domain")
            .nullable(),
          // spend_limit: z.coerce
          //   .number()
          //   .default(5.0)
          //   .describe("Workspace budget (maximum usage per billing period)"),
          hugging_face_token: z
            .string()
            .optional()
            .describe("Hugging Face Token")
            .nullable(),
        })}
        data={userSettings}
        serverAction={async (data) => {
          if (!hasBusinessPlan(sub?.plans?.plans)) {
            toast.error("Settings require an active Business plan.");
            return userSettings;
          }

          if (
            data?.spend_limit &&
            Number(data.spend_limit) >
              (userSettings?.max_spend_limit || DEFAULT_MAX_SPEND_LIMIT)
          ) {
            toast.error(
              `Spend limit cannot be greater than ${
                userSettings?.max_spend_limit || DEFAULT_MAX_SPEND_LIMIT
              }. Please contact us via Email or Discord DM to raise this limit.`,
            );
            return;
          }
          await updateUser(data);
        }}
        dependencies={[
          {
            type: DependencyType.HIDES,
            sourceField: "custom_output_bucket",
            targetField: [
              "s3_access_key_id",
              "s3_bucket_name",
              "s3_region",
              "s3_secret_access_key",
              "use_cloudfront",
              "assumed_role_arn",
            ],
            when(sourceFieldValue, targetFieldValue) {
              return !sourceFieldValue;
            },
          },
          {
            type: DependencyType.HIDES,
            sourceField: "use_cloudfront",
            targetField: ["cloudfront_domain"],
            when(sourceFieldValue, targetFieldValue) {
              return !sourceFieldValue;
            },
          },
        ]}
        fieldConfig={{
          custom_output_bucket: {
            fieldType: "switch",
            group: "Storage Settings [Business]",
            renderParent: (props) => {
              return (
                <div
                  className={
                    !enableStorage ? "pointer-events-none opacity-50" : ""
                  }
                >
                  {props.children}
                </div>
              );
            },
          },
          use_cloudfront: {
            fieldType: "switch",
            group: "Storage Settings [Business]",
            description: (
              <p className="text-muted-foreground text-xs">
                Enable CloudFront (CDN) for faster content delivery from your S3
                bucket. Only for <strong>public</strong> outputs.
              </p>
            ),
          },
          cloudfront_domain: {
            group: "Storage Settings [Business]",
            inputProps: {
              placeholder: "d1234567890.cloudfront.net",
            },
          },
          assumed_role_arn: {
            group: "Storage Settings [Business]",
            description: (
              <>
                <p>
                  {
                    "The ARN of the role that will be used to access the S3 bucket. Contact us for more information."
                  }
                </p>
              </>
            ),
          },
          // spend_limit: {
          //   fieldType: "number",
          //   inputProps: {
          //     min: 0,
          //     step: 0.01,
          //     max: userSettings?.max_spend_limit || DEFAULT_MAX_SPEND_LIMIT,
          //     required: true,
          //   },
          //   description: (
          //     <>
          //       {`The budget of this workspace is limited to
          //         `}
          //       <strong>{`$${
          //         userSettings?.max_spend_limit || DEFAULT_MAX_SPEND_LIMIT
          //       }`}</strong>
          //       {`. To raise this limit, please
          //         contact us via Email or `}
          //       <a
          //         href="https://discord.gg/ygb6VZwaMt"
          //         target="_blank"
          //         rel="noopener noreferrer"
          //         className="text-blue-500 underline hover:text-blue-600"
          //       >
          //         Discord
          //       </a>
          //       {" DM. "}
          //       <br />
          //       <p className="text-gray-500 text-xs italic">
          //         {`
          //         Note: Only works for v2 API.
          //         `}
          //       </p>
          //     </>
          //   ),
          // },
          output_visibility: {
            group: "Storage Settings [Business]",
            renderParent: (props) => {
              return (
                <div
                  className={
                    !enableStorage ? "pointer-events-none opacity-50" : ""
                  }
                >
                  {props.children}
                </div>
              );
            },
            description: (
              <p className="italic text-gray-500 text-xs">
                If your S3 bucket is configured as <strong>private</strong>{" "}
                only, be sure to set this option to <strong>private</strong> so
                that your outputs remain accessible.
              </p>
            ),
          },
          s3_secret_access_key: {
            group: "Storage Settings [Business]",
            inputProps: {
              type: "password",
            },
          },
          s3_access_key_id: {
            group: "Storage Settings [Business]",
            inputProps: {
              type: "password",
            },
          },
          s3_bucket_name: {
            group: "Storage Settings [Business]",
          },
          s3_region: {
            group: "Storage Settings [Business]",
          },
          hugging_face_token: {
            fieldType: "fallback",
            group: "Hugging Face",
            inputProps: {
              type: "password",
            },
            description: (
              <>
                <Link
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 underline hover:text-blue-600"
                >
                  Hugging Face token
                </Link>
                {" is used to install private models from Hugging Face."}
              </>
            ),
          },
        }}
      />
    </div>
  );
}
